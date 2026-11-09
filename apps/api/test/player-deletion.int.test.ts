import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailDispatcher } from '../src/auth/mail/mail-dispatcher.js';
import type { ApiError } from '../src/common/errors/api-error.js';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// Suppression de la fiche d'un enfant mineur par son tuteur (lot 1.16cbb, EX-118 n° 3) sur la pile
// réelle : tuteur vérifié seul, ré-authentification, 404 uniforme, emails, masquage aux tiers.

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let verifiedGuardian: PlayerFixtures['verifiedGuardian'];
let player: PlayerFixtures['player'];
let publish: PlayerFixtures['publish'];

const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;
const call = (method: 'post' | 'get' | 'delete', token: string, ozId: string) => {
  const agent = request(server);
  const path = `/players/${ozId}/deletion`;
  const pending =
    method === 'post' ? agent.post(path) : method === 'get' ? agent.get(path) : agent.delete(path);
  return pending.set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`);
};
const ask = (token: string, ozId: string, body: object = { password: PASSWORD }) =>
  call('post', token, ozId).send(body);
const read = (token: string, ozId: string) =>
  request(server)
    .get(`/players/${ozId}`)
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`);

/** Tuteur connecté et fiche de son enfant mineur, avec ou sans compte de l'enfant. */
const family = async (childAccount = false) => {
  const guardian = await account('guardian');
  // La fixture pose une 2FA factice à tout rôle ; le tuteur n'y est pas tenu (ré-authentification
  // par mot de passe seul ici, la 2FA est couverte par `account-deletion.int.test.ts`).
  await harness.db.query(
    'UPDATE users SET totp_secret_encrypted = NULL, totp_enabled_at = NULL WHERE id = $1',
    [guardian.userId],
  );
  const guardianId = await verifiedGuardian(guardian.userId);
  const child = childAccount ? await account('player') : null;
  const fiche = await player({
    userId: child?.userId ?? null,
    birthDate: '2012-06-07',
    guardianId,
  });
  return { guardian, guardianId, child, ...fiche };
};
const emailOf = async (userId: string): Promise<string> =>
  (await harness.db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]))
    .rows[0]?.email ?? '';

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, verifiedGuardian, player, publish } = await playerFixtures(
    harness,
    'suppression-enfant',
  ));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('/players/:ozId/deletion', () => {
  it('tuteur vérifié : 202 à +30 jours, suivi, emails au tuteur et à l’enfant, puis annulation', async () => {
    const fam = await family(true);
    expect((await call('get', fam.guardian.token, fam.ozId).expect(200)).body).toEqual({
      pending: null,
    });
    const response = await ask(fam.guardian.token, fam.ozId).expect(202);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as { requestedAt: string; scheduledFor: string };
    expect(Date.parse(body.scheduledFor) - Date.parse(body.requestedAt)).toBe(30 * 86_400_000);
    expect((await call('get', fam.guardian.token, fam.ozId).expect(200)).body).toEqual({
      pending: body,
    });
    const again = await ask(fam.guardian.token, fam.ozId).expect(409);
    expect(errorOf(again).code).toBe('ACCOUNT_DELETION_PENDING');

    await harness.app.get(MailDispatcher).flush();
    const guardianMail = await harness.mailTo(
      await emailOf(fam.guardian.userId),
      'Suppression de la fiche de votre enfant programmée sur OZ',
    );
    expect(guardianMail).toContain('annuler');
    const childUser = fam.child?.userId ?? '';
    expect(
      await harness.mailTo(
        await emailOf(childUser),
        'Suppression de votre compte OZ demandée par votre tuteur',
      ),
    ).toContain('Seul votre tuteur');

    // L'enfant ne peut pas annuler la demande de son tuteur (D2).
    await request(server)
      .delete('/account/deletion')
      .set('Authorization', `Bearer ${fam.child?.token ?? ''}`)
      .expect(404);

    await call('delete', fam.guardian.token, fam.ozId).expect(204);
    expect((await call('get', fam.guardian.token, fam.ozId).expect(200)).body).toEqual({
      pending: null,
    });
    const missing = await call('delete', fam.guardian.token, fam.ozId).expect(404);
    expect(errorOf(missing).code).toBe('ACCOUNT_DELETION_NOT_FOUND');
    await harness.app.get(MailDispatcher).flush();
    await harness.mailTo(
      await emailOf(childUser),
      'Suppression de votre compte OZ annulée par votre tuteur',
    );
  });

  it('mot de passe faux : 403 indiscernable, aucune demande', async () => {
    const fam = await family();
    const refused = await ask(fam.guardian.token, fam.ozId, {
      password: 'mauvais mot de passe',
    }).expect(403);
    expect(errorOf(refused).code).toBe('ACCOUNT_DELETION_REJECTED');
    expect((await call('get', fam.guardian.token, fam.ozId).expect(200)).body).toEqual({
      pending: null,
    });
  });

  it('autre tuteur, enfant majeur, OZ ID inconnu : même 404 ; autre rôle : 403', async () => {
    const fam = await family();
    const other = await account('guardian');
    await verifiedGuardian(other.userId);
    for (const method of ['post', 'get', 'delete'] as const) {
      const response = await (
        method === 'post' ? ask(other.token, fam.ozId) : call(method, other.token, fam.ozId)
      ).expect(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
    }
    const adult = await player({ birthDate: '1990-01-01', guardianId: fam.guardianId });
    await ask(fam.guardian.token, adult.ozId).expect(404);
    await ask(fam.guardian.token, 'OZ-CM-26-000000-0').expect(404);
    const club = await account('club', await organization('club'));
    await ask(club.token, fam.ozId).expect(403);
  });

  it('fiche publiée en suppression : invisible des tiers, lue par le tuteur', async () => {
    const fam = await family();
    await publish(fam.id, fam.guardianId);
    const federation = await account('federation', await organization('federation'));
    await read(federation.token, fam.ozId).expect(200);
    await ask(fam.guardian.token, fam.ozId).expect(202);
    await read(federation.token, fam.ozId).expect(404);
    await read(fam.guardian.token, fam.ozId).expect(200);
  });

  it('ni mot de passe ni OZ ID au journal', async () => {
    const fam = await family();
    await ask(fam.guardian.token, fam.ozId).expect(202);
    const logs = JSON.stringify(harness.logs.lines());
    expect(logs).toContain('/players/:ozId/deletion');
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain(fam.ozId);
  });
});
