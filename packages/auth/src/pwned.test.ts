import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PWNED_DEFAULT_TIMEOUT_MS, PwnedPasswordsClient, type FetchLike } from './pwned.js';

const PASSWORD = 'correct horse battery';
const SHA1 = createHash('sha1').update(PASSWORD, 'utf8').digest('hex').toUpperCase();
const PREFIX = SHA1.slice(0, 5);
const SUFFIX = SHA1.slice(5);

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
}

function fakeFetch(body: string, status = 200, calls: Call[] = []): FetchLike {
  return (url, init) => {
    calls.push({ url, headers: init.headers });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    });
  };
}

describe('HaveIBeenPwned par k-anonymité (EX-103 n° 2)', () => {
  it("n'envoie que les 5 premiers caractères de l'empreinte SHA-1, avec remplissage", async () => {
    const calls: Call[] = [];
    const client = new PwnedPasswordsClient({
      fetch: fakeFetch(`${'0'.repeat(35)}:0`, 200, calls),
    });
    expect(await client.check(PASSWORD)).toBe('clean');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(calls[0]?.url).not.toContain(SUFFIX);
    expect(calls[0]?.headers['Add-Padding']).toBe('true');
  });

  it('signale un mot de passe présent dans la base', async () => {
    const body = `0000000000000000000000000000000000A:3\r\n${SUFFIX}:42\r\n`;
    const client = new PwnedPasswordsClient({ fetch: fakeFetch(body) });
    expect(await client.check(PASSWORD)).toBe('breached');
  });

  it('ignore les lignes de remplissage (compte 0) et la casse', async () => {
    const body = `${SUFFIX.toLowerCase()}:0\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:12`;
    const client = new PwnedPasswordsClient({ fetch: fakeFetch(body) });
    expect(await client.check(PASSWORD)).toBe('clean');
  });

  it('hache le mot de passe normalisé NFKC', async () => {
    const calls: Call[] = [];
    const client = new PwnedPasswordsClient({ fetch: fakeFetch('', 200, calls) });
    await client.check('mot de passe é');
    const expected = createHash('sha1')
      .update('mot de passe é', 'utf8')
      .digest('hex')
      .toUpperCase();
    expect(calls[0]?.url.endsWith(expected.slice(0, 5))).toBe(true);
  });

  it('renvoie « indisponible » sur un corps vide, illisible ou démesuré', async () => {
    for (const body of ['', '<html>portail captif</html>', `${SUFFIX}:1\n`.repeat(10_000)]) {
      const client = new PwnedPasswordsClient({ fetch: fakeFetch(body) });
      expect(await client.check(PASSWORD)).toBe('unavailable');
    }
  });

  it('borne aussi la lecture du corps par le délai', async () => {
    const slowBody: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(`${SUFFIX}:1`);
            }, 500);
          }),
      });
    const started = Date.now();
    const client = new PwnedPasswordsClient({ fetch: slowBody, timeoutMs: 20 });
    expect(await client.check(PASSWORD)).toBe('unavailable');
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('renvoie « indisponible » sur une réponse en erreur', async () => {
    const client = new PwnedPasswordsClient({ fetch: fakeFetch('', 503) });
    expect(await client.check(PASSWORD)).toBe('unavailable');
  });

  it('renvoie « indisponible » sur une erreur réseau ou un délai dépassé, sans lever', async () => {
    const failing: FetchLike = () => Promise.reject(new Error('ECONNRESET'));
    expect(await new PwnedPasswordsClient({ fetch: failing }).check(PASSWORD)).toBe('unavailable');

    const signals: AbortSignal[] = [];
    const hanging: FetchLike = (_url, init) => {
      signals.push(init.signal);
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason as Error);
        });
      });
    };
    const client = new PwnedPasswordsClient({ fetch: hanging, timeoutMs: 20 });
    expect(await client.check(PASSWORD)).toBe('unavailable');
    expect(signals[0]?.aborted).toBe(true);
  });

  it('borne le délai par défaut à 1,5 s et accepte un autre point d’accès', async () => {
    expect(PWNED_DEFAULT_TIMEOUT_MS).toBe(1_500);
    const calls: Call[] = [];
    const client = new PwnedPasswordsClient({
      fetch: fakeFetch('', 200, calls),
      endpoint: 'http://localhost:9999/',
    });
    await client.check(PASSWORD);
    expect(calls[0]?.url).toBe(`http://localhost:9999/range/${PREFIX}`);
  });

  it('utilise fetch global par défaut', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', fakeFetch(`${SUFFIX}:1`, 200, calls));
    try {
      expect(await new PwnedPasswordsClient().check(PASSWORD)).toBe('breached');
      expect(calls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
