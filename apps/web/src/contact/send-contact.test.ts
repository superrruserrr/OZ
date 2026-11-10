// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendContact } from './send-contact';

const VALID = {
  name: 'Éliot Moukoko',
  email: 'eliot@exemple.test',
  organisationType: 'academy',
  message: 'Bonjour, notre académie souhaite rejoindre OZ.',
  consent: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('action serveur du contact (lot 1.6, D4)', () => {
  it('revalide (C2) et transmet à API_URL/contact', async () => {
    vi.stubEnv('API_URL', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact(VALID)).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://api.test/contact');
    expect(JSON.parse(init.body as string)).toEqual(VALID);
  });

  it('refuse un message invalide sans appeler l’API', async () => {
    vi.stubEnv('API_URL', 'http://api.test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendContact({ ...VALID, consent: false })).resolves.toEqual({ ok: false });
    await expect(sendContact({ ...VALID, extra: 'x' })).resolves.toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('échec réseau ou refus : résultat neutre, sans détail', async () => {
    vi.stubEnv('API_URL', 'http://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1')));
    await expect(sendContact(VALID)).resolves.toEqual({ ok: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(sendContact(VALID)).resolves.toEqual({ ok: false });
  });

  it('sans API_URL : échec neutre', async () => {
    vi.stubEnv('API_URL', '');
    await expect(sendContact(VALID)).resolves.toEqual({ ok: false });
  });
});
