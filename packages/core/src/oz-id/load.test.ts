import { describe, expect, it } from 'vitest';
import { issueWithRetry } from './generate.js';
import { formatOzId, isValidOzId } from './oz-id.js';

// EX-102 n° 8 : 1 000 000 d'émissions dans un même couple (pays, année), contre un registre en
// mémoire, par le même algorithme de reprise que l'émission en base (issueOzId).
const TOTAL = 1_000_000;

describe('charge : 1 000 000 d’OZ ID', () => {
  it('aucune collision émise ; les reprises suivent le paradoxe des anniversaires (D3)', async () => {
    const registry = new Set<string>();
    let retries = 0;
    for (let i = 0; i < TOTAL; i += 1) {
      const { attempts } = await issueWithRetry((random) => {
        if (registry.has(random)) return null;
        registry.add(random);
        return random;
      });
      retries += attempts - 1;
    }
    expect(registry.size).toBe(TOTAL);
    // Espérance ≈ n² / (2 × 32⁶) ≈ 466 (écart type ≈ 22) : bornes très larges, aucun faux échec.
    expect(retries).toBeGreaterThan(300);
    expect(retries).toBeLessThan(700);
    // Échantillon : chaque partie forme un OZ ID valide.
    for (const random of Array.from(registry).slice(0, 10_000)) {
      expect(isValidOzId(formatOzId({ country: 'CM', year: 26, random }))).toBe(true);
    }
  }, 30_000);
});
