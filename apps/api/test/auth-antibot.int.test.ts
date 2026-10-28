import { issueFormToken } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  type AuthHarness,
} from './auth-harness.js';

// Anti-robot à l'inscription (lot 1.3ca, D4 à D6) : un robot reçoit la même réponse qu'un humain,
// rien n'est créé ni envoyé, et seul le motif est journalisé.

const PASSWORD = 'correct horse battery staple';
const HMAC_KEY = 'h'.repeat(40);

let harness: AuthHarness;
let server: App;
let counter = 0;
const email = (): string => `robot-${String(++counter)}@example.test`;

const register = (body: object) => request(server).post('/auth/register').send(body);

async function outcome(address: string): Promise<{ users: number; mails: number }> {
  await harness.app.get(MailDispatcher).flush();
  const { rows } = await harness.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM users WHERE email = $1',
    [address],
  );
  return { users: rows[0]?.n ?? 0, mails: (await harness.subjectsTo(address)).length };
}

const botEvents = () => harness.logs.lines().filter((line) => line.event === 'auth.bot.rejected');

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
}, 180_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(() => {
  harness.pwned = 'clean';
  harness.recaptcha = { verdict: 'human', score: 0.9 };
});

describe('robot détecté (D5) : 202 identique, rien de créé ni d’envoyé', () => {
  it.each([
    ['honeypot', () => ({ website: 'https://spam.example', formToken: formToken() })],
    ['form_too_fast', () => ({ formToken: issueFormToken(HMAC_KEY, Date.now()) })],
    ['form_expired', () => ({ formToken: issueFormToken(HMAC_KEY, Date.now() - 3 * 3_600_000) })],
    [
      'form_invalid',
      () => ({ formToken: issueFormToken('autre-cle'.repeat(5), Date.now() - 10_000) }),
    ],
  ])('%s', async (reason, extra) => {
    const address = email();
    const before = botEvents().length;
    const response = await register({ email: address, password: PASSWORD, ...extra() }).expect(202);
    expect(response.body).toEqual({ status: 'accepted' });
    expect(await outcome(address)).toEqual({ users: 0, mails: 0 });
    const events = botEvents().slice(before);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe(reason);
    // Seul le motif : ni adresse ni jeton dans le journal.
    expect(JSON.stringify(events[0])).not.toContain(address);
  });

  it('score reCAPTCHA bas', async () => {
    harness.recaptcha = { verdict: 'bot', reason: 'score' };
    const address = email();
    await register({ email: address, password: PASSWORD, formToken: formToken() }).expect(202);
    expect(await outcome(address)).toEqual({ users: 0, mails: 0 });
    expect(botEvents().at(-1)?.reason).toBe('recaptcha_score');
  });

  it('champ piège vide : inscription normale', async () => {
    const address = email();
    await register({
      email: address,
      password: PASSWORD,
      website: '',
      formToken: formToken(),
    }).expect(202);
    expect(await outcome(address)).toEqual({ users: 1, mails: 1 });
  });

  it('jeton de formulaire absent : 422 (contrat)', async () => {
    await register({ email: email(), password: PASSWORD }).expect(422);
  });

  it('mot de passe compromis : 422 pour un robot comme pour un humain (rien n’est révélé)', async () => {
    harness.pwned = 'breached';
    const bot = await register({
      email: email(),
      password: PASSWORD,
      website: 'x',
      formToken: formToken(),
    }).expect(422);
    const human = await register({
      email: email(),
      password: PASSWORD,
      formToken: formToken(),
    }).expect(422);
    expect((bot.body as { code: string }).code).toBe((human.body as { code: string }).code);
  });

  it('limite par adresse : 429 pour un robot comme pour un humain', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      register_email: { limit: 1, windowSeconds: 3600 },
    });
    const address = email();
    await register({
      email: address,
      password: PASSWORD,
      website: 'x',
      formToken: formToken(),
    }).expect(202);
    await register({ email: address, password: PASSWORD, formToken: formToken() }).expect(429);
    expect(await outcome(address)).toEqual({ users: 0, mails: 0 });
    await harness.setRateLimits(RELAXED_RATE_LIMITS);
  });
});

describe('reCAPTCHA indisponible (D4)', () => {
  it('inscription acceptée, panne journalisée', async () => {
    harness.recaptcha = { verdict: 'unavailable' };
    const address = email();
    await register({ email: address, password: PASSWORD, formToken: formToken() }).expect(202);
    expect(await outcome(address)).toEqual({ users: 1, mails: 1 });
    expect(harness.logs.lines().some((line) => line.event === 'auth.recaptcha.unavailable')).toBe(
      true,
    );
  });
});

describe('durée (D5)', () => {
  it('indiscernable entre inscription acceptée et robot rejeté (écart des médianes < 25 %)', async () => {
    const timed = async (body: object): Promise<number> => {
      const started = performance.now();
      await register(body).expect(202);
      return performance.now() - started;
    };
    const human: number[] = [];
    const bot: number[] = [];
    for (let i = 0; i < 20; i++) {
      human.push(await timed({ email: email(), password: PASSWORD, formToken: formToken() }));
      bot.push(
        await timed({ email: email(), password: PASSWORD, website: 'x', formToken: formToken() }),
      );
    }
    const gap = Math.abs(median(human) - median(bot)) / Math.max(median(human), median(bot));
    expect(gap).toBeLessThan(0.25);
  });
});
