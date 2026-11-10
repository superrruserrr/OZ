import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Inscription joueur (lot 1.7a, EX-107) sur la pile réelle : majeur jusqu'à l'OZ ID, mineur bloqué
// sans tuteur, reprise après interruption, isolement entre comptes, rien en clair en base, bornes
// d'âge à chaque couche (C2 et C4).

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

let harness: AuthHarness;
let server: App;
let counter = 0;

/** Date de naissance donnant `years` ans révolus aujourd'hui (UTC). */
const bornYearsAgo = (years: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const IDENTITY = {
  firstName: 'Éliot',
  lastName: 'Signupmarqueur',
  birthDate: bornYearsAgo(20),
  nationality: 'CM',
  country: 'CM',
  city: 'Douala',
};
const SPORT = { primaryPosition: 'striker', dominantFoot: 'right', heightCm: 178 };
const AFFILIATION = { mode: 'none' };
const GUARDIAN = {
  firstName: 'Awa',
  lastName: 'Tuteurmarqueur',
  relationship: 'mother',
  country: 'CM',
  phone: '+237690001122',
};

async function signedIn(): Promise<{ token: string; userId: string }> {
  const address = `inscription-${String(++counter)}@example.test`;
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
  return { token: (login.body as { accessToken: string }).accessToken, userId: rows[0]?.id ?? '' };
}

const as = (token: string) => ({
  read: () =>
    request(server)
      .get('/players/signup')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`),
  save: (step: string, body: unknown) =>
    request(server)
      .put(`/players/signup/${step}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object),
  complete: () =>
    request(server)
      .post('/players/signup/complete')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`),
});

beforeAll(async () => {
  harness = await startAuthHarness();
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
  server = harness.app.getHttpServer();
}, 240_000);
afterAll(async () => {
  await harness.stop();
});

describe('inscription d’un majeur (EX-107 n° 1, 2, 5, 6)', () => {
  it('étapes enregistrées, reprises, puis OZ ID `declared`, rôle joueur, audit', async () => {
    const { token, userId } = await signedIn();
    const api = as(token);
    const empty = await api.read().expect(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(empty.body).toMatchObject({
      minor: null,
      missing: ['identity', 'sport', 'affiliation'],
    });

    await api.save('identity', IDENTITY).expect(200);
    // Reprise après interruption : une nouvelle session relit ce qui a été saisi.
    const resumed = await api.read().expect(200);
    expect(resumed.body).toMatchObject({
      steps: { identity: IDENTITY, sport: null },
      minor: false,
      missing: ['sport', 'affiliation'],
    });

    await api.save('sport', SPORT).expect(200);
    await api.save('affiliation', AFFILIATION).expect(200);
    const done = await api.complete().expect(201);
    const body = done.body as { ozId: string; minor: boolean; completeness: number };
    expect(body).toMatchObject({ verificationStatus: 'declared', minor: false });
    expect(body.ozId).toMatch(/^OZ-CM-\d{2}-[0-9A-Z]{6}-[0-9A-Z]$/);
    expect(body.completeness).toBeGreaterThan(0);

    const { rows } = await harness.db.query<{ oz_id: string; verification_status: string }>(
      'SELECT oz_id, verification_status FROM players WHERE user_id = $1',
      [userId],
    );
    expect(rows).toEqual([{ oz_id: body.ozId, verification_status: 'declared' }]);
    const roles = await harness.db.query('SELECT role FROM user_roles WHERE user_id = $1', [
      userId,
    ]);
    expect(roles.rows).toEqual([{ role: 'player' }]);
    const audit = await harness.db.query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM audit_log WHERE actor_user_id = $1
       AND action IN ('player.signup.completed', 'player.oz_id.issued') ORDER BY chain_position`,
      [userId],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'player.signup.completed',
      'player.oz_id.issued',
    ]);
    expect(JSON.stringify(audit.rows[0]?.metadata)).not.toContain('Signupmarqueur');
    // Brouillon supprimé ; une seconde finalisation ou saisie est refusée.
    expect(
      (await harness.db.query('SELECT 1 FROM player_signups WHERE user_id = $1', [userId]))
        .rowCount,
    ).toBe(0);
    expect((await api.complete().expect(409)).body).toMatchObject({
      code: 'SIGNUP_ALREADY_COMPLETED',
    });
    await api.save('identity', IDENTITY).expect(409);
    await api.read().expect(409);
  });

  it('finalisation incomplète : 422 avec les étapes manquantes', async () => {
    const { token } = await signedIn();
    const api = as(token);
    await api.save('identity', IDENTITY).expect(200);
    const refused = await api.complete().expect(422);
    expect(refused.body).toMatchObject({
      code: 'SIGNUP_INCOMPLETE',
      details: [
        { field: 'sport', code: 'required' },
        { field: 'affiliation', code: 'required' },
      ],
    });
  });
});

describe('inscription d’un mineur (EX-107 n° 4, D4)', () => {
  it('bloc tuteur obligatoire et bloquant, puis tuteur déclaré, contacts chiffrés', async () => {
    const { token, userId } = await signedIn();
    const api = as(token);
    const minor = { ...IDENTITY, birthDate: bornYearsAgo(15) };
    const saved = await api.save('identity', minor).expect(200);
    expect(saved.body).toMatchObject({ minor: true });
    await api.save('sport', SPORT).expect(200);
    await api.save('affiliation', AFFILIATION).expect(200);
    expect((await api.read().expect(200)).body).toMatchObject({ missing: ['guardian'] });
    const blocked = await api.complete().expect(422);
    expect(blocked.body).toMatchObject({
      code: 'SIGNUP_GUARDIAN_REQUIRED',
      details: [{ field: 'guardian', code: 'required' }],
    });
    await api.save('guardian', { ...GUARDIAN, phone: undefined }).expect(422);
    await api.save('guardian', GUARDIAN).expect(200);
    expect((await api.complete().expect(201)).body).toMatchObject({ minor: true });

    const { rows } = await harness.db.query<{
      relationship: string;
      verification_status: string;
      user_id: string | null;
      phone_encrypted: Buffer | null;
    }>(
      `SELECT g.relationship, g.verification_status, g.user_id, g.phone_encrypted
       FROM players p JOIN guardians g ON g.id = p.guardian_id WHERE p.user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relationship: 'mother',
      verification_status: 'declared',
      user_id: null,
    });
    expect(rows[0]?.phone_encrypted?.toString('latin1')).not.toContain('690001122');
  });

  it('un majeur ne reçoit pas de tuteur, même si l’étape a été saisie', async () => {
    const { token, userId } = await signedIn();
    const api = as(token);
    await api.save('identity', { ...IDENTITY, birthDate: bornYearsAgo(15) }).expect(200);
    await api.save('guardian', GUARDIAN).expect(200);
    await api.save('identity', IDENTITY).expect(200);
    await api.save('sport', SPORT).expect(200);
    await api.save('affiliation', AFFILIATION).expect(200);
    expect((await api.complete().expect(201)).body).toMatchObject({ minor: false });
    const { rows } = await harness.db.query('SELECT guardian_id FROM players WHERE user_id = $1', [
      userId,
    ]);
    expect(rows).toEqual([{ guardian_id: null }]);
  });
});

describe('bornes, isolement et confidentialité', () => {
  it('âge hors bornes : refusé par le contrat (C2) et par la base (C4)', async () => {
    const { token, userId } = await signedIn();
    const api = as(token);
    for (const birthDate of [bornYearsAgo(5), bornYearsAgo(46)]) {
      await api.save('identity', { ...IDENTITY, birthDate }).expect(422);
    }
    await api.save('photo', {}).expect(422);
    await api.save('identity', { ...IDENTITY, ozId: 'OZ-CM-26-7K4M9Q-3' }).expect(422);
    // Base seule, sous le contexte du compte : même refus.
    const client = await harness.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('oz.user_id', $1, true)`, [userId]);
      const { rows } = await client.query<{ r: { outcome: string } }>(
        `SELECT oz_player_signup_save('identity', $1::jsonb, $2) AS r`,
        [JSON.stringify({ ...IDENTITY, birthDate: bornYearsAgo(50) }), 'k'.repeat(32)],
      );
      expect(rows[0]?.r.outcome).toBe('invalid');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('un compte ne voit pas le brouillon d’un autre ; rien en clair en base', async () => {
    const first = await signedIn();
    const second = await signedIn();
    await as(first.token).save('identity', IDENTITY).expect(200);
    expect((await as(second.token).read().expect(200)).body).toMatchObject({
      steps: { identity: null },
    });
    const { rows } = await harness.db.query<{ identity: Buffer }>(
      'SELECT identity FROM player_signups WHERE user_id = $1',
      [first.userId],
    );
    expect(rows[0]?.identity.toString('latin1')).not.toContain('Signupmarqueur');
  });

  it('étape indéchiffrable (clé changée) : à ressaisir, jamais une erreur permanente', async () => {
    const { token, userId } = await signedIn();
    const api = as(token);
    await api.save('identity', IDENTITY).expect(200);
    await harness.db.query(
      `UPDATE player_signups SET identity = oz_encrypt('{}', repeat('z', 32)) WHERE user_id = $1`,
      [userId],
    );
    expect((await api.read().expect(200)).body).toMatchObject({
      steps: { identity: null },
      missing: ['identity', 'sport', 'affiliation'],
    });
    await api.save('sport', SPORT).expect(200);
    expect((await api.complete().expect(422)).body).toMatchObject({ code: 'SIGNUP_INCOMPLETE' });
    await api.save('identity', IDENTITY).expect(200);
  });

  it('rôle joueur retiré : la finalisation ne le rend jamais (403)', async () => {
    const { token, userId } = await signedIn();
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, deleted_at) VALUES ($1, 'player', now())`,
      [userId],
    );
    const api = as(token);
    await api.save('identity', IDENTITY).expect(200);
    await api.save('sport', SPORT).expect(200);
    await api.save('affiliation', AFFILIATION).expect(200);
    expect((await api.complete().expect(403)).body).toMatchObject({ code: 'SIGNUP_REFUSED' });
    expect(
      (await harness.db.query('SELECT 1 FROM players WHERE user_id = $1', [userId])).rowCount,
    ).toBe(0);
  });

  it('email non vérifié : refus 403 sans motif', async () => {
    const { token, userId } = await signedIn();
    await harness.db.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [userId]);
    expect((await as(token).read()).status).toBeGreaterThanOrEqual(401);
  });

  it('sans session : 401 ; journal applicatif sans donnée saisie', async () => {
    await request(server).get('/players/signup').set('Origin', ORIGIN).expect(401);
    expect(JSON.stringify(harness.logs.lines())).not.toContain('Signupmarqueur');
    expect(JSON.stringify(harness.logs.lines())).not.toContain('Tuteurmarqueur');
  });
});
