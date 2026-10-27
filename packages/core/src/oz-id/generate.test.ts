import { describe, expect, it } from 'vitest';
import { CROCKFORD_ALPHABET } from './crockford.js';
import {
  generateOzId,
  issueWithRetry,
  OZ_ID_MAX_ATTEMPTS,
  OzIdExhaustedError,
  randomOzIdPart,
  type RandomSource,
} from './generate.js';
import { isValidOzId } from './oz-id.js';

/** Source qui rejoue des octets donnés, en boucle. */
const replay =
  (...bytes: number[]): RandomSource =>
  (target) => {
    target.forEach((_, i) => (target[i] = bytes[i % bytes.length] ?? 0));
  };

describe('randomOzIdPart', () => {
  it('rend six symboles Crockford, sans I, L, O ni U (CP-04)', () => {
    for (let i = 0; i < 1_000; i += 1) expect(randomOzIdPart()).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('prend 5 bits par octet : 256 est multiple de 32, aucun biais de modulo', () => {
    expect(randomOzIdPart(replay(0, 31, 32, 63, 255, 224))).toBe('0Z0ZZ0');
  });

  it('suit une loi uniforme sur l’alphabet (χ² sur 100 000 tirages, EX-102 n° 3)', () => {
    const counts = new Map<string, number>();
    const draws = 100_000 / 6;
    for (let i = 0; i < draws; i += 1) {
      for (const symbol of randomOzIdPart()) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    const total = Math.round(draws) * 6;
    const expected = total / 32;
    const chi2 = Array.from(CROCKFORD_ALPHABET).reduce(
      (sum, s) => sum + ((counts.get(s) ?? 0) - expected) ** 2 / expected,
      0,
    );
    // 31 degrés de liberté : seuil à 0,1 % = 61,1 (un faux échec sur mille exécutions).
    expect(chi2).toBeLessThan(61.1);
  });

  it('refuse un environnement sans source d’aléa cryptographique', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => randomOzIdPart()).toThrow(/aléa cryptographique/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('generateOzId', () => {
  it('forme un OZ ID valide, non séquentiel : deux tirages successifs diffèrent', () => {
    const first = generateOzId({ country: 'CM', year: 26 });
    const second = generateOzId({ country: 'CM', year: 26 });
    expect(isValidOzId(first) && isValidOzId(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('utilise la source fournie', () => {
    expect(generateOzId({ country: 'CM', year: 26 }, replay(7, 19, 4, 20, 9, 23))).toBe(
      'OZ-CM-26-7K4M9Q-M',
    );
  });
});

describe('issueWithRetry', () => {
  it('rend le premier résultat accepté, après des tirages déjà pris', async () => {
    const taken = new Set(['000000', '111111']);
    const sequence = [0, 1, 2];
    let call = 0;
    const source: RandomSource = (target) => target.fill(sequence[call++] ?? 0);
    const tried: string[] = [];
    const result = await issueWithRetry((random) => {
      tried.push(random);
      return taken.has(random) ? null : `réservé:${random}`;
    }, source);
    expect(tried).toEqual(['000000', '111111', '222222']);
    expect(result).toEqual({ value: 'réservé:222222', attempts: 3 });
  });

  it(`abandonne après ${String(OZ_ID_MAX_ATTEMPTS)} tirages pris, par une erreur explicite`, async () => {
    let calls = 0;
    const attempt = (): null => {
      calls += 1;
      return null;
    };
    await expect(issueWithRetry(attempt, replay(0))).rejects.toBeInstanceOf(OzIdExhaustedError);
    expect(calls).toBe(OZ_ID_MAX_ATTEMPTS);
  });

  it('laisse passer l’erreur de la réservation sans tirer à nouveau', async () => {
    let calls = 0;
    const failing = (): Promise<null> => {
      calls += 1;
      return Promise.reject(new Error('refusé'));
    };
    await expect(issueWithRetry(failing)).rejects.toThrow('refusé');
    expect(calls).toBe(1);
  });
});
