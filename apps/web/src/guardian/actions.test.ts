// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
const written: { name: string; value: string; options: Record<string, unknown> }[] = [];
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        written.push({ name, value, options });
        if (options.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      },
    }),
  headers: () =>
    Promise.resolve(new Headers({ 'x-forwarded-for': '198.51.100.4', 'user-agent': 'Test' })),
}));

const actions = await import('./actions');

const fetchMock = vi.fn<typeof fetch>();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const ACCESS = `${encode({ alg: 'EdDSA' })}.${encode({
  sub: 'user-1',
  exp: Math.floor(Date.now() / 1000) + 600,
})}.signature`;
const TOKEN = 'A'.repeat(43);
const INVITE = '__Host-oz_guardian_invite';
const GUARDIAN = '01900000-0000-7000-8000-000000000001';
const SHA = 'a'.repeat(64);

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const apiError = (code: string) => ({ code, message: 'interne Dupont', requestId: 'r' });
const sent = (index = 0) => fetchMock.mock.calls[index];
const urlOf = (index = 0): string => {
  const target = sent(index)?.[0];
  return target instanceof URL ? target.href : typeof target === 'string' ? target : '';
};
const bodyOf = (index = 0): unknown => {
  const body = sent(index)?.[1]?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
};

beforeEach(() => {
  jar.clear();
  written.length = 0;
  jar.set('__Host-oz_access', ACCESS);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.stubEnv('APP_URL', 'https://oz.test');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('invitation par le joueur mineur', () => {
  it('canal email : rien d’autre que le canal ; canal lien : le lien, une fois', async () => {
    fetchMock.mockResolvedValueOnce(reply(202, { channel: 'email' }));
    await expect(actions.inviteGuardian()).resolves.toEqual({ ok: true, channel: 'email' });
    const link = 'https://oz.test/tuteur/invitation#token=abc';
    fetchMock.mockResolvedValueOnce(reply(202, { channel: 'link', link }));
    await expect(actions.inviteGuardian()).resolves.toEqual({ ok: true, channel: 'link', link });
    expect(urlOf()).toBe('http://api.test/players/me/guardian/invitation');
  });

  it('erreurs de l’API traduites en clés, sans le message de l’API', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, apiError('GUARDIAN_INVITATION_NOT_APPLICABLE')));
    const result = await actions.inviteGuardian();
    expect(result).toEqual({ ok: false, error: 'notApplicable' });
    expect(JSON.stringify(result)).not.toContain('Dupont');
  });

  it('sans session : aucun appel', async () => {
    jar.clear();
    await expect(actions.inviteGuardian()).resolves.toEqual({ ok: false, error: 'session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('invitation reçue par le tuteur (B4)', () => {
  it('aperçu sans session, puis jeton gardé en cookie httpOnly de 30 minutes', async () => {
    jar.clear();
    fetchMock.mockResolvedValueOnce(reply(200, { childFirstName: 'Awa', relationship: 'mother' }));
    await expect(actions.openInvitation(TOKEN)).resolves.toEqual({
      ok: true,
      preview: { childFirstName: 'Awa', relationship: 'mother' },
    });
    const [, init] = sent() ?? [];
    expect(urlOf()).toBe('http://api.test/guardians/invitations/read');
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
    expect(written[0]).toMatchObject({
      name: INVITE,
      value: TOKEN,
      options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 1800 },
    });
  });

  it('jeton mal formé : aucun appel ; invitation invalide : cookie effacé', async () => {
    await expect(actions.openInvitation('court')).resolves.toEqual({
      ok: false,
      error: 'invitationInvalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    jar.set(INVITE, TOKEN);
    fetchMock.mockResolvedValueOnce(reply(400, apiError('GUARDIAN_INVITATION_INVALID')));
    await actions.openInvitation(TOKEN);
    expect(jar.has(INVITE)).toBe(false);
  });

  it('acceptation : jeton du cookie envoyé avec la session, puis effacé', async () => {
    jar.set(INVITE, TOKEN);
    fetchMock.mockResolvedValueOnce(reply(200, { status: 'accepted' }));
    await expect(actions.acceptInvitation()).resolves.toEqual({ ok: true });
    const [, init] = sent() ?? [];
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${ACCESS}`);
    expect(bodyOf()).toEqual({ token: TOKEN });
    expect(jar.has(INVITE)).toBe(false);
    expect(written.at(-1)?.options).toMatchObject({ secure: true, path: '/', maxAge: 0 });
  });

  it('acceptation sans invitation gardée : aucun appel', async () => {
    await expect(actions.acceptInvitation()).resolves.toEqual({
      ok: false,
      error: 'invitationInvalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('pièces du justificatif relayées par le site (B1, B2)', () => {
  const form = (bytes: Uint8Array<ArrayBuffer>, type = 'birth_certificate') => {
    const data = new FormData();
    data.set('guardianId', GUARDIAN);
    data.set('documentType', type);
    data.set('file', new File([bytes], 'acte.pdf', { type: 'application/pdf' }));
    return data;
  };
  const PDF = new TextEncoder().encode('%PDF-1.7 contenu');

  it('type réel, empreinte, URL signée, envoi au stockage puis réception', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(201, {
          uploadId: '01900000-0000-7000-8000-000000000002',
          url: 'http://storage.test/clé?sig=1',
          method: 'PUT',
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(PDF.length),
            'x-amz-checksum-sha256': 'YWJj',
          },
          expiresAt: '2026-11-17T10:05:00.000Z',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        reply(201, { documentId: '01900000-0000-7000-8000-000000000003', status: 'pending' }),
      );
    await expect(actions.uploadPiece(form(PDF))).resolves.toEqual({
      ok: true,
      documentId: '01900000-0000-7000-8000-000000000003',
    });
    const issued = bodyOf(0) as Record<string, unknown>;
    expect(issued).toMatchObject({
      documentType: 'birth_certificate',
      guardianId: GUARDIAN,
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    expect(issued.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(decodeURI(urlOf(1))).toBe('http://storage.test/clé?sig=1');
    expect(sent(1)?.[1]?.method).toBe('PUT');
    expect(urlOf(2)).toContain('/complete');
  });

  it('contenu qui n’est ni PDF ni image : refusé sans appel', async () => {
    const result = await actions.uploadPiece(form(new TextEncoder().encode('<html>')));
    expect(result).toEqual({ ok: false, error: 'fileType' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('type de document hors justificatif : refusé', async () => {
    await expect(actions.uploadPiece(form(PDF, 'identity_document'))).resolves.toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('dépôt : 409 rendu lisible', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, apiError('GUARDIAN_LINK_ALREADY_SUBMITTED')));
    await expect(
      actions.submitLink({ guardianId: GUARDIAN, documentIds: [GUARDIAN] }),
    ).resolves.toEqual({ ok: false, error: 'alreadySubmitted' });
  });
});

describe('accords', () => {
  it('consentement : corps validé, mot de passe jamais renvoyé ; ré-authentification refusée', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, apiError('GUARDIAN_REAUTH_REJECTED')));
    const result = await actions.grantConsent('OZ-ABCD-EFGH', {
      type: 'guardian_data_processing',
      textVersion: 'v1-provisoire',
      textSha256: SHA,
      password: 'secret de test 123',
    });
    expect(result).toEqual({ ok: false, error: 'reauth' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('OZ ID hors forme : aucun appel', async () => {
    await expect(actions.revokeConsent('../admin', 'guardian_data_processing')).resolves.toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retrait : nombre d’accords retirés', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { revoked: 2 }));
    await expect(
      actions.revokeConsent('OZ-ABCD-EFGH', 'guardian_data_processing'),
    ).resolves.toEqual({ ok: true, revoked: 2 });
    expect(sent()?.[1]?.method).toBe('DELETE');
  });
});
