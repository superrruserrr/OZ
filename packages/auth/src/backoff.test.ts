import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BACKOFF_FREE_FAILURES, BACKOFF_MAX_SECONDS, backoffSeconds } from './backoff.js';

describe('délai exponentiel après échecs (EX-103 n° 8)', () => {
  it('laisse 2 échecs sans délai et impose une attente dès le 3e', () => {
    expect(BACKOFF_FREE_FAILURES).toBe(3);
    expect([0, 1, 2].map(backoffSeconds)).toEqual([0, 0, 0]);
    expect(backoffSeconds(3)).toBe(1);
  });

  it('double ensuite à chaque échec', () => {
    expect([3, 4, 5, 6, 7, 8].map(backoffSeconds)).toEqual([1, 2, 4, 8, 16, 32]);
  });

  it('plafonne à 15 minutes, jamais de verrouillage définitif', () => {
    expect(BACKOFF_MAX_SECONDS).toBe(900);
    expect(backoffSeconds(12)).toBe(512);
    expect(backoffSeconds(13)).toBe(900);
    expect(backoffSeconds(1_000_000)).toBe(900);
    expect(backoffSeconds(Number.MAX_SAFE_INTEGER)).toBe(900);
  });

  it('traite une valeur négative ou non entière comme aucun échec', () => {
    expect(backoffSeconds(-5)).toBe(0);
    expect(backoffSeconds(Number.NaN)).toBe(0);
    expect(backoffSeconds(2.9)).toBe(0);
    expect(backoffSeconds(4.9)).toBe(2);
  });

  it('est fini, borné et croissant pour tout nombre d’échecs', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        const d = backoffSeconds(n);
        return (
          Number.isFinite(d) && d >= 0 && d <= BACKOFF_MAX_SECONDS && backoffSeconds(n + 1) >= d
        );
      }),
    );
  });
});
