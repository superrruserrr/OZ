import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECAPTCHA_DEFAULT_TIMEOUT_MS,
  RecaptchaVerifier,
  type RecaptchaFetch,
} from './recaptcha.js';

// reCAPTCHA v3, vérification côté serveur (lot 1.3ca, D4).

const SECRET = 'secret-de-test-recaptcha';
const HUMAN = {
  success: true,
  score: 0.9,
  action: 'register',
  hostname: 'oz.localhost',
  challenge_ts: '2026-10-28T12:00:00Z',
};

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: string;
}

function fakeFetch(body: unknown, status = 200, calls: Call[] = []): RecaptchaFetch {
  return (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    });
  };
}

const verifier = (fetch: RecaptchaFetch, timeoutMs?: number) =>
  new RecaptchaVerifier({
    secret: SECRET,
    minScore: 0.5,
    hostnames: ['oz.localhost'],
    fetch,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

describe('RecaptchaVerifier (D4)', () => {
  it('POST siteverify avec le secret et le jeton, sans IP du client ; verdict human', async () => {
    const calls: Call[] = [];
    expect(await verifier(fakeFetch(HUMAN, 200, calls)).verify('jeton-client')).toEqual({
      verdict: 'human',
      score: 0.9,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://www.google.com/recaptcha/api/siteverify');
    expect(calls[0]?.method).toBe('POST');
    const form = new URLSearchParams(calls[0]?.body);
    expect(form.get('secret')).toBe(SECRET);
    expect(form.get('response')).toBe('jeton-client');
    expect(form.has('remoteip')).toBe(false);
  });

  it.each([
    ['score', { ...HUMAN, score: 0.3 }],
    ['action', { ...HUMAN, action: 'login' }],
    ['hostname', { ...HUMAN, hostname: 'ailleurs.example' }],
    ['rejected', { success: false, 'error-codes': ['invalid-input-response'] }],
    ['rejected', { success: false, 'error-codes': ['timeout-or-duplicate'] }],
    ['hostname', { ...HUMAN, hostname: undefined }],
  ])('bot (%s)', async (reason, body) => {
    expect(await verifier(fakeFetch(body)).verify('jeton')).toMatchObject({
      verdict: 'bot',
      reason,
    });
  });

  it('jeton absent ou vide : bot (missing), sans appel à Google', async () => {
    const calls: Call[] = [];
    const v = verifier(fakeFetch(HUMAN, 200, calls));
    expect(await v.verify(undefined)).toEqual({ verdict: 'bot', reason: 'missing' });
    expect(await v.verify('')).toEqual({ verdict: 'bot', reason: 'missing' });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['statut 500', fakeFetch(HUMAN, 500)],
    ['corps illisible', fakeFetch('<html>portail</html>')],
    ['corps null', fakeFetch('null')],
    ['refus sans code d’erreur (portail)', fakeFetch({ success: false })],
    ['objet vide', fakeFetch({})],
    ['corps trop long', fakeFetch('x'.repeat(20_000))],
    ['score absent', fakeFetch({ ...HUMAN, score: undefined })],
    ['réseau', () => Promise.reject(new Error(`échec ${SECRET}`))],
  ])('unavailable (%s)', async (_, fetch) => {
    expect(await verifier(fetch).verify('jeton')).toEqual({ verdict: 'unavailable' });
  });

  it('secret refusé par Google : unavailable, cause configuration', async () => {
    const body = { success: false, 'error-codes': ['invalid-input-secret'] };
    expect(await verifier(fakeFetch(body)).verify('jeton')).toEqual({
      verdict: 'unavailable',
      cause: 'configuration',
    });
  });

  it('délai dépassé (3 s par défaut) : unavailable, l’appel est abandonné', async () => {
    expect(RECAPTCHA_DEFAULT_TIMEOUT_MS).toBe(3_000);
    let aborted = false;
    const hanging: RecaptchaFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('abandon'));
        });
      });
    expect(await verifier(hanging, 20).verify('jeton')).toEqual({ verdict: 'unavailable' });
    expect(aborted).toBe(true);
  });

  it('le secret n’apparaît dans aucun verdict', async () => {
    const results = await Promise.all([
      verifier(() => Promise.reject(new Error(SECRET))).verify('jeton'),
      verifier(fakeFetch({ success: false, 'error-codes': [SECRET] })).verify('jeton'),
    ]);
    expect(JSON.stringify(results)).not.toContain(SECRET);
  });

  it('sans `fetch` injecté : le `fetch` global', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', fakeFetch(HUMAN, 200, calls));
    const v = new RecaptchaVerifier({ secret: SECRET, minScore: 0.5, hostnames: ['OZ.localhost'] });
    expect(await v.verify('jeton')).toEqual({ verdict: 'human', score: 0.9 });
    expect(calls).toHaveLength(1);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
