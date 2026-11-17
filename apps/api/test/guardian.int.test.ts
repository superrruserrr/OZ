import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Tuteur légal (lot 1.7ba, EX-108 n° 1 et 6) sur la pile réelle : le mineur invite son tuteur
// déclaré, le tuteur accepte avec son compte : rattachement en attente, sans rôle ni droit sur la
// fiche avant la vérification du lien (D3). Données synthétiques seulement.

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const SUBJECT = 'Vous êtes invité comme tuteur légal sur OZ';

let harness: AuthHarness;
let server: App;
let counter = 0;

const bornYearsAgo = (years: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

interface Account {
  readonly token: string;
  readonly userId: string;
  readonly address: string;
}

async function signedIn(): Promise<Account> {
  const address = `tuteur-lot-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const verify = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token: verify }).expect(200);
  const login = await request(server)
    .post('/auth/login')
    .send({ email: address, password: PASSWORD })
    .expect(200);
  const { rows } = await harness.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    address,
  ]);
  return {
    token: (login.body as { accessToken: string }).accessToken,
    userId: rows[0]?.id ?? '',
    address,
  };
}

const call = (method: 'get' | 'post' | 'put', path: string, token?: string) => {
  const pending = request(server)[method](path).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

interface Child extends Account {
  readonly ozId: string;
  readonly firstName: string;
}

/** Joueur inscrit par le parcours réel ; `guardian` : contact du tuteur déclaré (mineur). */
async function player(
  years: number,
  guardian?: { readonly email?: string; readonly phone?: string },
): Promise<Child> {
  const account = await signedIn();
  // Prénom distinct par joueur, en lettres seulement (le contrat refuse les chiffres).
  const firstName = `Enfant${String(counter).replace(/\d/g, (digit) => 'abcdefghij'.charAt(Number(digit)))}`;
  const save = (step: string, body: object) =>
    call('put', `/players/signup/${step}`, account.token).send(body).expect(200);
  await save('identity', {
    firstName,
    lastName: 'Famillemarqueur',
    birthDate: bornYearsAgo(years),
    nationality: 'CM',
    country: 'CM',
    city: 'Douala',
  });
  await save('sport', { primaryPosition: 'striker', dominantFoot: 'right' });
  await save('affiliation', { mode: 'none' });
  if (guardian !== undefined) {
    await save('guardian', {
      firstName: 'Awa',
      lastName: 'Tuteurmarqueur',
      relationship: 'mother',
      country: 'CM',
      ...guardian,
    });
  }
  const done = await call('post', '/players/signup/complete', account.token).expect(201);
  return { ...account, firstName, ozId: (done.body as { ozId: string }).ozId };
}

const invite = (token: string) => call('post', '/players/me/guardian/invitation', token);
const preview = (token: string) => call('post', '/guardians/invitations/read').send({ token });
const accept = (session: string | undefined, token: string) =>
  call('post', '/guardians/invitations/accept', session).send({ token });
const children = (session: string) => call('get', '/guardians/me/children', session);
const code = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

/** Invitation par lien (tuteur sans email) : le jeton est rendu au joueur. */
async function linkToken(child: Child): Promise<string> {
  const response = await invite(child.token).expect(202);
  const body = response.body as { channel: string; link: string };
  expect(body.channel).toBe('link');
  return tokenIn(body.link);
}

const auditOf = async (action: string, userId: string) =>
  (
    await harness.db.query<{ metadata: Record<string, unknown> }>(
      'SELECT metadata FROM audit_log WHERE action = $1 AND actor_user_id = $2 ORDER BY chain_position',
      [action, userId],
    )
  ).rows;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('POST /players/me/guardian/invitation', () => {
  it('tuteur avec email : lien envoyé par OZ, prénom de l’enfant seul, rien de sensible rendu', async () => {
    const guardianAddress = `parent-${String(++counter)}@example.test`;
    const child = await player(15, { email: guardianAddress });
    const response = await invite(child.token).expect(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ channel: 'email' });

    const text = await harness.mailTo(guardianAddress, SUBJECT);
    expect(text).toContain('http://localhost:3000/tuteur/invitation#token=');
    expect(text).toContain(child.firstName);
    for (const secret of ['Famillemarqueur', child.ozId, child.address]) {
      expect(text).not.toContain(secret);
    }
    const [audit] = await auditOf('guardian.invitation.created', child.userId);
    expect(audit?.metadata).toMatchObject({ channel: 'email' });
    expect(JSON.stringify(audit)).not.toContain(guardianAddress);
    const logged = harness.logs.raw();
    for (const secret of [guardianAddress, tokenIn(text), child.firstName]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('tuteur sans email : lien rendu au joueur ; une nouvelle invitation annule la précédente', async () => {
    const child = await player(14, { phone: '+237690001122' });
    const first = await linkToken(child);
    const second = await linkToken(child);
    expect(second).not.toBe(first);
    expect(code(await preview(first).expect(400))).toBe('GUARDIAN_INVITATION_INVALID');
    expect((await preview(second).expect(200)).body).toEqual({
      childFirstName: child.firstName,
      relationship: 'mother',
    });
    // En base : l'empreinte seulement, jamais le jeton.
    const stored = await harness.db.query<{ token_hash: string }>(
      'SELECT token_hash FROM guardian_invitations',
    );
    for (const row of stored.rows) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect([first, second]).not.toContain(row.token_hash);
    }
  });

  it('409 : joueur majeur, compte sans fiche ; 401 sans session ; 429 au-delà de la limite', async () => {
    const adult = await player(20);
    expect(code(await invite(adult.token).expect(409))).toBe('GUARDIAN_INVITATION_NOT_APPLICABLE');
    const nobody = await signedIn();
    expect(code(await invite(nobody.token).expect(409))).toBe('GUARDIAN_INVITATION_NOT_APPLICABLE');
    await call('post', '/players/me/guardian/invitation').expect(401);

    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      guardian_invite_account: { limit: 1, windowSeconds: 3600 },
    });
    const child = await player(13, { phone: '+237690001133' });
    await invite(child.token).expect(202);
    const limited = await invite(child.token).expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

/** Vérification du lien simulée (lots 1.7bb et 1.10) : compte posé sur la fiche, rôle tuteur. */
async function verifyLink(guardian: Account, child: Child): Promise<void> {
  await harness.db.query(
    `UPDATE guardians SET user_id = $1, verification_status = 'verified'
     WHERE id = (SELECT guardian_id FROM players WHERE oz_id = $2)`,
    [guardian.userId, child.ozId],
  );
  await harness.db.query(
    `INSERT INTO user_roles (user_id, role) SELECT $1, 'guardian'
     WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'guardian')`,
    [guardian.userId],
  );
}

const pendingOf = (child: Child) => ({
  guardianVerified: false,
  ozId: null,
  firstName: child.firstName,
  lastName: null,
  verificationStatus: 'declared',
  published: false,
});

describe('aperçu et acceptation', () => {
  it('accepter : rattachement en attente, sans rôle ni droit sur la fiche (D3)', async () => {
    const child = await player(15, { phone: '+237690001144' });
    const token = await linkToken(child);
    const guardian = await signedIn();
    expect((await children(guardian.token).expect(200)).body).toEqual({ children: [] });

    const accepted = await accept(guardian.token, token).expect(200);
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(accepted.body).toEqual({ status: 'accepted' });

    // Rien de l'existant ne s'ouvre : fiche tuteur sans compte, aucun rôle, fiche illisible.
    const row = await harness.db.query<{ user_id: string | null; verification_status: string }>(
      'SELECT user_id, verification_status FROM guardians WHERE id = (SELECT guardian_id FROM players WHERE oz_id = $1)',
      [child.ozId],
    );
    expect(row.rows).toEqual([{ user_id: null, verification_status: 'declared' }]);
    const roles = await harness.db.query('SELECT 1 FROM user_roles WHERE user_id = $1', [
      guardian.userId,
    ]);
    expect(roles.rows).toEqual([]);
    await call('get', `/players/${child.ozId}`, guardian.token).expect(403);

    const pending = await children(guardian.token).expect(200);
    expect(pending.headers['cache-control']).toBe('no-store');
    expect(pending.body).toEqual({ children: [pendingOf(child)] });
    expect(JSON.stringify(pending.body)).not.toContain('Famillemarqueur');
    const [audit] = await auditOf('guardian.invitation.accepted', guardian.userId);
    expect(Object.keys(audit?.metadata ?? {})).toEqual(['invitation_id']);
    const logged = harness.logs.raw();
    for (const secret of [token, child.firstName, child.ozId]) expect(logged).not.toContain(secret);

    // Usage unique.
    expect(code(await accept(guardian.token, token).expect(400))).toBe(
      'GUARDIAN_INVITATION_INVALID',
    );
    expect(code(await preview(token).expect(400))).toBe('GUARDIAN_INVITATION_INVALID');

    // Une fois le lien vérifié (simulé) : vue tuteur de la fiche, nom et OZ ID.
    await verifyLink(guardian, child);
    const profile = await call('get', `/players/${child.ozId}`, guardian.token).expect(200);
    expect(profile.body).toMatchObject({ ozId: child.ozId, firstName: child.firstName });
    expect((await children(guardian.token).expect(200)).body).toEqual({
      children: [
        {
          ...pendingOf(child),
          guardianVerified: true,
          ozId: child.ozId,
          lastName: 'Famillemarqueur',
        },
      ],
    });
    expect(code(await invite(child.token).expect(409))).toBe('GUARDIAN_INVITATION_NOT_APPLICABLE');
  });

  it('mauvais destinataire : le joueur réinvite, le rattachement en attente tombe', async () => {
    const child = await player(14, { phone: '+237690001145' });
    const stranger = await signedIn();
    await accept(stranger.token, await linkToken(child)).expect(200);
    expect((await children(stranger.token).expect(200)).body).toEqual({
      children: [pendingOf(child)],
    });
    const fresh = await linkToken(child);
    expect((await children(stranger.token).expect(200)).body).toEqual({ children: [] });
    const guardian = await signedIn();
    await accept(guardian.token, fresh).expect(200);
    expect((await children(guardian.token).expect(200)).body).toEqual({
      children: [pendingOf(child)],
    });
  });

  it('deux enfants : vérifiés séparément, aucun droit hérité (EX-108 n° 6, D2 révisée)', async () => {
    const guardian = await signedIn();
    const first = await player(15, { phone: '+237690001155' });
    const second = await player(12, { phone: '+237690001155' });
    await accept(guardian.token, await linkToken(first)).expect(200);
    await accept(guardian.token, await linkToken(second)).expect(200);
    expect((await children(guardian.token).expect(200)).body).toEqual({
      children: [pendingOf(first), pendingOf(second)],
    });

    await verifyLink(guardian, first);
    await call('get', `/players/${first.ozId}`, guardian.token).expect(200);
    await call('get', `/players/${second.ozId}`, guardian.token).expect(404);
    expect((await children(guardian.token).expect(200)).body).toEqual({
      children: [
        {
          ...pendingOf(first),
          guardianVerified: true,
          ozId: first.ozId,
          lastName: 'Famillemarqueur',
        },
        pendingOf(second),
      ],
    });
  });

  it('refus : l’enfant, un joueur mineur, un autre compte après acceptation, sans session', async () => {
    const child = await player(16, { phone: '+237690001166' });
    const token = await linkToken(child);
    expect(code(await accept(child.token, token).expect(403))).toBe('GUARDIAN_SELF');
    const minor = await player(15, { phone: '+237690001167' });
    expect(code(await accept(minor.token, token).expect(403))).toBe('GUARDIAN_REFUSED');
    await accept(undefined, token).expect(401);
    await accept(child.token, 'abc').expect(422);
    await preview('abc').expect(422);
    expect(code(await preview('A'.repeat(43)).expect(400))).toBe('GUARDIAN_INVITATION_INVALID');

    const guardian = await signedIn();
    await accept(guardian.token, token).expect(200);
    const other = await signedIn();
    expect(code(await accept(other.token, token).expect(400))).toBe('GUARDIAN_INVITATION_INVALID');
    expect((await children(other.token).expect(200)).body).toEqual({ children: [] });
    await call('get', '/guardians/me/children').expect(401);
  });

  it('deux acceptations concurrentes de la même invitation : une seule réussit', async () => {
    const child = await player(15, { phone: '+237690001177' });
    const token = await linkToken(child);
    const [a, b] = await Promise.all([signedIn(), signedIn()]);
    const results = await Promise.all([accept(a.token, token), accept(b.token, token)]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 400]);
    const rows = await harness.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM guardian_invitations i JOIN players p ON p.id = i.player_id
       WHERE p.oz_id = $1 AND i.accepted_by IS NOT NULL`,
      [child.ozId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it('expirée, enfant devenu majeur, compte du tuteur clos ; aperçu limité par IP', async () => {
    const guardian = await signedIn();
    const expired = await player(15, { phone: '+237690001188' });
    const expiredToken = await linkToken(expired);
    await harness.db.query(
      `UPDATE guardian_invitations SET expires_at = now() - interval '1 minute'
       WHERE player_id = (SELECT id FROM players WHERE oz_id = $1) AND cancelled_at IS NULL`,
      [expired.ozId],
    );
    expect(code(await preview(expiredToken).expect(400))).toBe('GUARDIAN_INVITATION_INVALID');
    expect(code(await accept(guardian.token, expiredToken).expect(400))).toBe(
      'GUARDIAN_INVITATION_INVALID',
    );

    const grown = await player(17, { phone: '+237690001189' });
    const grownToken = await linkToken(grown);
    await harness.db.query(
      "UPDATE players SET birth_date = (now() - interval '19 years')::date WHERE oz_id = $1",
      [grown.ozId],
    );
    expect(code(await accept(guardian.token, grownToken).expect(400))).toBe(
      'GUARDIAN_INVITATION_INVALID',
    );

    const kept = await player(13, { phone: '+237690001190' });
    await accept(guardian.token, await linkToken(kept)).expect(200);
    await harness.db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [guardian.userId]);
    const released = await harness.db.query<{ cancelled: boolean }>(
      `SELECT cancelled_at IS NOT NULL AS cancelled FROM guardian_invitations
       WHERE accepted_by = $1`,
      [guardian.userId],
    );
    expect(released.rows).toEqual([{ cancelled: true }]);

    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      guardian_invitation_ip: { limit: 1, windowSeconds: 3600 },
    });
    // Les aperçus précédents de cette suite ont déjà dépassé la limite abaissée à 1.
    const limited = await preview('B'.repeat(43)).expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
