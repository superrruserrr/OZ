import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_RULES,
  resolveRateLimits,
  slidingLogDecision,
} from './rate-limit.js';

describe('limites par défaut (§6.6, D7 du lot 1.3ca)', () => {
  it('reprennent les valeurs du plan', () => {
    expect(RATE_LIMIT_DEFAULTS.login_ip).toEqual({ limit: 5, windowSeconds: 900 });
    expect(RATE_LIMIT_DEFAULTS.login_account).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.register_ip).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.register_email).toEqual({ limit: 1, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.forgot_ip).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.forgot_email).toEqual({ limit: 1, windowSeconds: 900 });
    expect(RATE_LIMIT_DEFAULTS.verify_email_ip).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.reset_ip).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.refresh_ip).toEqual({ limit: 60, windowSeconds: 60 });
    expect(RATE_LIMIT_DEFAULTS.register_form_ip).toEqual({ limit: 20, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.new_device_email).toEqual({ limit: 3, windowSeconds: 86_400 });
    expect(RATE_LIMIT_DEFAULTS.document_upload_account).toEqual({ limit: 20, windowSeconds: 3600 });
    expect(RATE_LIMIT_DEFAULTS.document_complete_account).toEqual({
      limit: 60,
      windowSeconds: 3600,
    });
    expect(RATE_LIMIT_DEFAULTS.document_read_account).toEqual({
      limit: 120,
      windowSeconds: 3600,
    });
    expect(RATE_LIMIT_DEFAULTS.audit_log_read_account).toEqual({
      limit: 600,
      windowSeconds: 3600,
    });
    expect(RATE_LIMIT_DEFAULTS.player_profile_read_account).toEqual({
      limit: 300,
      windowSeconds: 3600,
    });
    expect(RATE_LIMIT_DEFAULTS.player_visibility_update_account).toEqual({
      limit: 30,
      windowSeconds: 3600,
    });
    expect(RATE_LIMIT_DEFAULTS.data_export_request_account).toEqual({
      limit: 10,
      windowSeconds: 3600,
    });
    expect(Object.keys(RATE_LIMIT_DEFAULTS).sort()).toEqual([...RATE_LIMIT_RULES].sort());
  });
});

describe('resolveRateLimits (réglage `rate_limits`, D2)', () => {
  it('sans réglage : les défauts', () => {
    expect(resolveRateLimits(null)).toEqual({ limits: RATE_LIMIT_DEFAULTS, valid: true });
  });

  it('réglage partiel : fusionné avec les défauts', () => {
    const { limits, valid } = resolveRateLimits({ login_ip: { limit: 2, windowSeconds: 60 } });
    expect(valid).toBe(true);
    expect(limits.login_ip).toEqual({ limit: 2, windowSeconds: 60 });
    expect(limits.register_ip).toEqual(RATE_LIMIT_DEFAULTS.register_ip);
  });

  it.each([
    ['une règle inconnue', { inconnue: { limit: 1, windowSeconds: 1 } }],
    ['une limite nulle', { login_ip: { limit: 0, windowSeconds: 60 } }],
    ['une fenêtre trop longue', { login_ip: { limit: 1, windowSeconds: 8 * 86_400 } }],
    ['un nombre décimal', { login_ip: { limit: 1.5, windowSeconds: 60 } }],
    ['une valeur qui n’est pas un objet', 'login_ip=1'],
    ['une règle nulle', { login_ip: null }],
    ['une règle en tableau', { login_ip: [1, 60] }],
    ['un tableau', [{ limit: 1, windowSeconds: 60 }]],
    ['un champ en trop', { login_ip: { limit: 1, windowSeconds: 60, burst: 2 } }],
  ])('réglage invalide (%s) : les défauts, signalé', (_, value) => {
    expect(resolveRateLimits(value)).toEqual({ limits: RATE_LIMIT_DEFAULTS, valid: false });
  });
});

describe('slidingLogDecision (modèle du script Redis)', () => {
  const rule = { limit: 3, windowSeconds: 10 };

  it('accepte jusqu’à la limite, puis donne l’attente jusqu’à la sortie de la plus ancienne', () => {
    let entries: number[] = [];
    for (const now of [0, 1_000, 2_000]) {
      const decision = slidingLogDecision(entries, now, rule);
      expect(decision.allowed).toBe(true);
      entries = decision.entries;
    }
    const refused = slidingLogDecision(entries, 2_500, rule);
    expect(refused).toMatchObject({ allowed: false, retryAfterSeconds: 8 });
    expect(slidingLogDecision(entries, 10_000, rule).allowed).toBe(true);
  });

  it('propriété : aucune fenêtre glissante ne contient plus de passages que la limite', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.integer({ min: 0, max: 5_000 }), { maxLength: 80 }),
        (limit, windowSeconds, gaps) => {
          const windowMs = windowSeconds * 1000;
          let now = 0;
          let entries: number[] = [];
          const accepted: number[] = [];
          for (const gap of gaps) {
            now += gap;
            const decision = slidingLogDecision(entries, now, { limit, windowSeconds });
            entries = decision.entries;
            if (decision.allowed) accepted.push(now);
            else expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
          }
          for (const start of accepted) {
            const inWindow = accepted.filter((t) => t >= start && t < start + windowMs);
            expect(inWindow.length).toBeLessThanOrEqual(limit);
          }
        },
      ),
    );
  });

  it('limite abaissée : l’attente court jusqu’à la sortie de l’entrée de rang count - limite', () => {
    const entries = [0, 1_000, 2_000, 3_000, 4_000];
    expect(slidingLogDecision(entries, 5_000, { limit: 2, windowSeconds: 60 })).toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
    });
  });

  it('propriété : après l’attente annoncée, le passage est accordé (même limite abaissée)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.integer({ min: 0, max: 30_000 }), { maxLength: 15 }),
        (limit, windowSeconds, offsets) => {
          const now = 30_000;
          const entries = offsets.map((offset) => now - offset).sort((a, b) => a - b);
          const decision = slidingLogDecision(entries, now, { limit, windowSeconds });
          if (decision.allowed) return;
          const later = now + decision.retryAfterSeconds * 1000;
          expect(
            slidingLogDecision(decision.entries, later, { limit, windowSeconds }).allowed,
          ).toBe(true);
          // Pas plus tôt : une seconde avant, toujours refusé.
          if (decision.retryAfterSeconds > 1) {
            expect(
              slidingLogDecision(decision.entries, later - 1000, { limit, windowSeconds }).allowed,
            ).toBe(false);
          }
        },
      ),
    );
  });
});
