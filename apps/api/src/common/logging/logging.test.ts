import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS, loggerOptions, resolveRequestId } from './logging.js';

function capture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('resolveRequestId (EX-T19)', () => {
  it('conserve un identifiant entrant bien formé', () => {
    expect(resolveRequestId('abc12345-def6-7890')).toBe('abc12345-def6-7890');
  });

  it.each([
    ['trop court', 'abc'],
    ['trop long', 'a'.repeat(65)],
    ['caractères spéciaux', 'abc12345;rm -rf'],
    ['injection de saut de ligne', 'abc12345\nX-Admin: 1'],
    ['plusieurs valeurs', ['abc12345-a', 'abc12345-b']],
    ['absent', undefined],
  ])('remplace un identifiant %s par un UUID neuf', (_, header) => {
    const id = resolveRequestId(header);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('masquage des logs (EX-T19 n° 2)', () => {
  it('masque les en-têtes et champs sensibles, à toute profondeur raisonnable', () => {
    const { stream, lines } = capture();
    const logger = pino({ redact: { paths: [...REDACT_PATHS], censor: '[Redacted]' } }, stream);
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1', host: 'api' } },
        res: { headers: { 'set-cookie': 'sid=2' } },
        password: 'p1',
        user: {
          email: 'a@b.c',
          phone: '+237600000000',
          profile: { birthDate: '2008-03-14', token: 't' },
        },
        secret: 's',
      },
      'test',
    );
    const [line] = lines();
    const text = JSON.stringify(line);
    for (const value of [
      'Bearer abc',
      'sid=1',
      'sid=2',
      'p1',
      'a@b.c',
      '+237600000000',
      '2008-03-14',
      '"t"',
      '"s"',
    ]) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain('"host":"api"');
    expect(text).toContain('[Redacted]');
  });
});

describe('nettoyage récursif des logs (EX-T19 n° 2, revue tour 1)', () => {
  function logOnce(payload: Record<string, unknown>): string {
    const { stream, lines } = capture();
    const logger = pino(loggerOptions('info'), stream);
    logger.info(payload, 'test');
    return JSON.stringify(lines()[0]);
  }

  it.each([
    ['casse', { Password: 'v1', EMAIL: 'v2', Authorization: 'v3' }],
    [
      'séparateurs et variantes',
      {
        birth_date: 'v1',
        birthdate: 'v2',
        phoneNumber: 'v3',
        apiKey: 'v4',
        passwordHash: 'v5',
        'proxy-authorization': 'v6',
      },
    ],
    ['en-têtes hors req', { headers: { authorization: 'v1', cookie: 'v2' } }],
    ['imbrication profonde', { a: { b: { c: { d: { e: { f: { password: 'v1' } } } } } } }],
    ['tableaux', { users: [{ email: 'v1' }, { profile: { phone: 'v2' } }] }],
  ])('masque les champs sensibles : %s', (_, payload) => {
    const text = logOnce(payload);
    for (const value of ['"v1"', '"v2"', '"v3"', '"v4"', '"v5"', '"v6"'])
      expect(text).not.toContain(value);
    expect(text).toContain('[Redacted]');
  });

  it('masque les données d’une erreur journalisée (ex. configuration de requête embarquée)', () => {
    const err = Object.assign(new Error('échec de l’appel fournisseur'), {
      config: { headers: { Authorization: 'Bearer fuite-1' }, data: { email: 'fuite-2' } },
    });
    const text = logOnce({ err });
    expect(text).not.toContain('fuite-1');
    expect(text).not.toContain('fuite-2');
    expect(text).toContain('échec de l’appel fournisseur');
    expect(text).toContain('"stack"');
  });

  it('conserve les champs ordinaires et supporte les références circulaires', () => {
    const circular: Record<string, unknown> = { host: 'api', statusCode: 200 };
    circular.self = circular;
    const text = logOnce({ data: circular });
    expect(text).toContain('"host":"api"');
    expect(text).toContain('"statusCode":200');
  });
});

describe('nettoyage des logs : types d’erreurs et robustesse (revue tour 2)', () => {
  function logOnce(payload: Record<string, unknown>): Record<string, unknown> {
    const { stream, lines } = capture();
    pino(loggerOptions('info'), stream).info(payload, 'test');
    return lines()[0] ?? {};
  }

  it('conserve le type réel d’une erreur, sa cause et les erreurs agrégées, nettoyées', () => {
    class PayloadTooLargeError extends Error {}
    const cause = Object.assign(new TypeError('cause racine'), { password: 'fuite-1' });
    const err = new PayloadTooLargeError('trop gros', { cause });
    const aggregate = new AggregateError([new RangeError('une')], 'plusieurs');
    const line = logOnce({ err, other: aggregate });
    const text = JSON.stringify(line);
    expect((line.err as { type: string }).type).toBe('PayloadTooLargeError');
    expect(text).toContain('cause racine');
    expect(text).toContain('TypeError');
    expect(text).toContain('RangeError');
    expect(text).not.toContain('fuite-1');
  });

  it('résume les données binaires au lieu de les recopier', () => {
    const text = JSON.stringify(logOnce({ data: Buffer.alloc(200_000), view: new Uint8Array(10) }));
    expect(text.length).toBeLessThan(2_000);
    expect(text).toContain('200000');
  });

  it('borne la taille d’un objet très large et d’une chaîne très longue', () => {
    const wide = Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [`k${String(i)}`, i]));
    const started = Date.now();
    const text = JSON.stringify(logOnce({ wide, long: 'x'.repeat(100_000) }));
    expect(Date.now() - started).toBeLessThan(200);
    expect(text.length).toBeLessThan(30_000);
  });

  it('rend lisibles Map, Set et URL, sans la requête d’une URL (jetons possibles)', () => {
    const text = JSON.stringify(
      logOnce({
        map: new Map([['a', 1]]),
        set: new Set(['b']),
        url: new URL('https://api.example/reset?token=secret-9'),
      }),
    );
    expect(text).toContain('"a":1');
    expect(text).toContain('"b"');
    expect(text).toContain('https://api.example/reset');
    expect(text).not.toContain('secret-9');
  });

  it('ne fait jamais échouer l’appel au logger, même avec un accesseur qui lève', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'boom', {
      enumerable: true,
      get: () => {
        throw new Error('accesseur');
      },
    });
    expect(() => logOnce({ hostile })).not.toThrow();
  });
});
