import { createHash } from 'node:crypto';
import { generateTotpCode } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Lot 1.7bb (EX-108 n° 2 à 5, CP-13) sur la pile réelle : le compte du rattachement en attente dépose
// le justificatif, un administrateur décide, le tuteur au lien approuvé consent puis révoque.
// Données synthétiques seulement.

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const STEP_MS = 30_000;
const APPROVED = 'Votre lien avec votre enfant est validé';
const REFUSED = 'Votre justificatif n’a pas été accepté'.replace('’', "'");

let harness: AuthHarness;
let server: App;
let counter = 0;

const bornYearsAgo = (years: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

interface Account {
  readonly token: string;
  readonly userId: string;
  readonly address: string;
}

async function signedIn(prefix = 'lien'): Promise<Account> {
  const address = `${prefix}-${String(++counter)}@example.test`;
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
  return {
    token: (login.body as { accessToken: string }).accessToken,
    userId: rows[0]?.id ?? '',
    address,
  };
}

const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
  const pending = request(server)[method](path).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

const code = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

/** Administrateur à 2FA réelle, enrôlé un pas en arrière : un code du pas courant reste libre. */
async function admin(): Promise<Account & { readonly secret: string }> {
  const account = await signedIn('admin');
  const setup = await call('post', '/auth/2fa/setup', account.token).expect(200);
  const { secret } = setup.body as { secret: string };
  await call('post', '/auth/2fa/enable', account.token)
    .send({ code: generateTotpCode(secret, Date.now() - STEP_MS) })
    .expect(200);
  // Rôles relus en base à chaque requête : la session ouverte suffit.
  await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [
    account.userId,
  ]);
  return { ...account, secret };
}

interface Child extends Account {
  readonly ozId: string;
  readonly playerId: string;
  readonly firstName: string;
}

/** Joueur mineur inscrit par le parcours réel ; tuteur déclaré sans email (lien rendu au joueur). */
async function minor(relationship = 'mother'): Promise<Child> {
  const account = await signedIn('enfant');
  const firstName = `Enfant${String(counter).replace(/\d/g, (digit) => 'abcdefghij'.charAt(Number(digit)))}`;
  const save = (step: string, body: object) =>
    call('put', `/players/signup/${step}`, account.token).send(body).expect(200);
  await save('identity', {
    firstName,
    lastName: 'Famillelien',
    birthDate: bornYearsAgo(12),
    nationality: 'CM',
    country: 'CM',
    city: 'Douala',
  });
  await save('sport', { primaryPosition: 'striker', dominantFoot: 'right' });
  await save('affiliation', { mode: 'none' });
  await save('guardian', {
    firstName: 'Awa',
    lastName: 'Tuteurlien',
    relationship,
    country: 'CM',
    phone: '+237670000000',
  });
  const done = await call('post', '/players/signup/complete', account.token).expect(201);
  const ozId = (done.body as { ozId: string }).ozId;
  const { rows } = await harness.db.query<{ id: string }>(
    'SELECT id FROM players WHERE oz_id = $1',
    [ozId],
  );
  return { ...account, firstName, ozId, playerId: rows[0]?.id ?? '' };
}

interface Pending {
  readonly child: Child;
  readonly tutor: Account;
  readonly guardianId: string;
}

/** Enfant mineur, invitation par lien, acceptée par un compte majeur : rattachement en attente. */
async function pendingLink(relationship = 'mother'): Promise<Pending> {
  const child = await minor(relationship);
  const invited = await call('post', '/players/me/guardian/invitation', child.token).expect(202);
  const token = tokenIn((invited.body as { link: string }).link);
  const tutor = await signedIn('tuteur');
  await call('post', '/guardians/invitations/accept', tutor.token).send({ token }).expect(200);
  const listed = await call('get', '/guardians/me/children', tutor.token).expect(200);
  const [entry] = (listed.body as { children: { guardianId: string }[] }).children;
  return { child, tutor, guardianId: entry?.guardianId ?? '' };
}

/** Pièce saine déjà analysée, déposée par `uploadedBy` sur la fiche tuteur (chemin privilégié). */
async function cleanPiece(
  guardianId: string,
  uploadedBy: string,
  type = 'birth_certificate',
  avStatus = 'clean',
): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `WITH n AS (SELECT oz_uuid_v7() AS id)
     INSERT INTO documents (id, type, guardian_id, uploaded_by, storage_key, mime_type, size_bytes,
       sha256, av_status, retention_until)
     SELECT n.id, $1::document_type, $2, $3,
       CASE WHEN $4 = 'clean' THEN 'clean/' ELSE 'quarantine/' END || n.id, 'application/pdf', 1000,
       repeat('a', 64), $4::av_status, now() + interval '90 days'
     FROM n RETURNING id::text`,
    [type, guardianId, uploadedBy, avStatus],
  );
  return rows[0]?.id ?? '';
}

const submit = (token: string, guardianId: string, documentIds: string[]) =>
  call('post', '/guardians/link/submit', token).send({ guardianId, documentIds });

const queue = (token: string) => call('get', '/admin/guardian-links', token);

const decide = (
  reviewer: Account & { readonly secret: string },
  reviewId: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) =>
  call('post', `/admin/guardian-links/${reviewId}/decision`, reviewer.token).send({
    ...body,
    password: PASSWORD,
    code: generateTotpCode(reviewer.secret, Date.now()),
  });

async function reviewIdOf(guardianId: string): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `SELECT id FROM guardian_link_reviews WHERE guardian_id = $1 AND status = 'submitted'`,
    [guardianId],
  );
  return rows[0]?.id ?? '';
}

const guardianRow = async (guardianId: string) =>
  (
    await harness.db.query<{ user_id: string | null; verification_status: string }>(
      'SELECT user_id, verification_status FROM guardians WHERE id = $1',
      [guardianId],
    )
  ).rows[0];

/** Rattachement en attente, justificatif déposé puis approuvé par un administrateur. */
async function approvedLink(): Promise<Pending> {
  const link = await pendingLink();
  const piece = await cleanPiece(link.guardianId, link.tutor.userId);
  await submit(link.tutor.token, link.guardianId, [piece]).expect(202);
  await decide(await admin(), await reviewIdOf(link.guardianId), { decision: 'approve' }).expect(
    200,
  );
  return link;
}

interface Text {
  readonly version: string;
  readonly sha256: string;
  readonly body: string;
}

async function text(type: string): Promise<Text> {
  return (await call('get', `/consent-texts/${type}/current`).expect(200)).body as Text;
}

async function consent(link: Pending, type: string, status: number, override: Partial<Text> = {}) {
  const current = { ...(await text(type)), ...override };
  return call('post', `/guardians/me/children/${link.child.ozId}/consents`, link.tutor.token)
    .send({
      type,
      textVersion: current.version,
      textSha256: current.sha256,
      password: PASSWORD,
    })
    .expect(status);
}

const published = async (playerId: string): Promise<boolean> =>
  (
    await harness.db.query<{ published: boolean }>(
      `SELECT oz_player_published(p.id, p.guardian_id, p.verification_status) AS published
       FROM players p WHERE p.id = $1`,
      [playerId],
    )
  ).rows[0]?.published === true;

/** Simule le KYC 2 du tuteur et la vérification de la fiche (lot 1.10, en pause). */
async function verifyAll(link: Pending): Promise<void> {
  await harness.db.query(`UPDATE guardians SET verification_status = 'verified' WHERE id = $1`, [
    link.guardianId,
  ]);
  await harness.db.query(`UPDATE players SET verification_status = 'verified' WHERE id = $1`, [
    link.child.playerId,
  ]);
}

const auditOf = async (action: string, userId: string) =>
  (
    await harness.db.query<{ metadata: Record<string, unknown> }>(
      'SELECT metadata FROM audit_log WHERE action = $1 AND actor_user_id = $2 ORDER BY chain_position',
      [action, userId],
    )
  ).rows;

beforeAll(async () => {
  harness = await startAuthHarness({ FEATURE_DOCUMENTS: 'true' });
  server = harness.app.getHttpServer();
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /guardians/me/children (lot 1.7bb)', () => {
  it('rattachement en attente : fiche tuteur et état du lien, ni nom ni OZ ID', async () => {
    const link = await pendingLink();
    const listed = await call('get', '/guardians/me/children', link.tutor.token).expect(200);
    expect((listed.body as { children: unknown[] }).children).toEqual([
      expect.objectContaining({
        guardianId: link.guardianId,
        linkStatus: 'awaiting_documents',
        ozId: null,
        lastName: null,
        consents: [],
        published: false,
      }),
    ]);
  });
});

describe('pièces du lien : dépôt par le compte en attente', () => {
  const pdf = (guardianId: string, documentType = 'birth_certificate') => ({
    documentType,
    guardianId,
    contentType: 'application/pdf',
    sizeBytes: 1000,
    sha256: createHash('sha256').update('piece').digest('hex'),
  });

  it('le compte en attente obtient une URL de dépôt pour l’acte et le jugement, rien d’autre', async () => {
    const link = await pendingLink();
    await call('post', '/documents/upload', link.tutor.token)
      .send(pdf(link.guardianId))
      .expect(201);
    await call('post', '/documents/upload', link.tutor.token)
      .send(pdf(link.guardianId, 'guardianship_order'))
      .expect(201);
    const identity = await call('post', '/documents/upload', link.tutor.token).send(
      pdf(link.guardianId, 'identity_document'),
    );
    expect(identity.status).toBe(404);
  });

  it('un autre compte, ou l’enfant, ne dépose rien sur cette fiche tuteur', async () => {
    const link = await pendingLink();
    const stranger = await signedIn('inconnu');
    expect(
      (await call('post', '/documents/upload', stranger.token).send(pdf(link.guardianId))).status,
    ).toBe(404);
    expect(
      (await call('post', '/documents/upload', link.child.token).send(pdf(link.guardianId))).status,
    ).toBe(404);
  });
});

describe('POST /guardians/link/submit', () => {
  it('dépôt : fiche `pending`, état `submitted`, audit sans donnée de personne', async () => {
    const link = await pendingLink();
    const piece = await cleanPiece(link.guardianId, link.tutor.userId);
    const response = await submit(link.tutor.token, link.guardianId, [piece]).expect(202);
    expect(response.body).toEqual({ status: 'submitted' });
    expect((await guardianRow(link.guardianId))?.verification_status).toBe('pending');
    const listed = await call('get', '/guardians/me/children', link.tutor.token).expect(200);
    expect((listed.body as { children: { linkStatus: string }[] }).children[0]?.linkStatus).toBe(
      'submitted',
    );
    const [audit] = await auditOf('guardian.link.submitted', link.tutor.userId);
    expect(Object.keys(audit?.metadata ?? {}).sort()).toEqual(['documents', 'review_id']);
    expect(JSON.stringify(harness.logs.lines())).not.toContain(link.child.firstName);
  });

  it('un second dépôt pendant la revue : 409', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const again = await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(409);
    expect(code(again)).toBe('GUARDIAN_LINK_ALREADY_SUBMITTED');
  });

  it('autre compte, ou fiche inconnue : 404 indiscernable', async () => {
    const link = await pendingLink();
    const piece = await cleanPiece(link.guardianId, link.tutor.userId);
    const stranger = await signedIn('inconnu');
    const foreign = await submit(stranger.token, link.guardianId, [piece]).expect(404);
    const unknown = await submit(link.tutor.token, '00000000-0000-7000-8000-000000000000', [
      piece,
    ]).expect(404);
    expect(code(foreign)).toBe('GUARDIAN_LINK_NOT_FOUND');
    expect(code(unknown)).toBe(code(foreign));
  });

  it.each([
    ['pas encore analysée', 'pending', 'birth_certificate', false],
    ['infectée', 'infected', 'birth_certificate', false],
    ['d’un autre type', 'clean', 'identity_document', false],
    ['d’un autre compte', 'clean', 'birth_certificate', true],
  ])('pièce %s : 400', async (_label, avStatus, type, foreign) => {
    const link = await pendingLink();
    const owner = foreign ? (await signedIn('autre')).userId : link.tutor.userId;
    const piece = await cleanPiece(link.guardianId, owner, type, avStatus);
    const response = await submit(link.tutor.token, link.guardianId, [piece]).expect(400);
    expect(code(response)).toBe('GUARDIAN_LINK_INVALID_DOCUMENTS');
  });

  it('plus de 3 pièces, ou une pièce en double : refusé', async () => {
    const link = await pendingLink();
    const pieces = await Promise.all(
      [1, 2, 3, 4].map(() => cleanPiece(link.guardianId, link.tutor.userId)),
    );
    await submit(link.tutor.token, link.guardianId, pieces).expect(422);
    const twice = await submit(link.tutor.token, link.guardianId, [
      pieces[0] ?? '',
      pieces[0] ?? '',
    ]);
    expect(code(twice)).toBe('GUARDIAN_LINK_INVALID_DOCUMENTS');
  });

  it('lien « tuteur légal » sans jugement de tutelle : 400 ; avec : accepté (R3)', async () => {
    const link = await pendingLink('legal_guardian');
    const birth = await cleanPiece(link.guardianId, link.tutor.userId);
    const missing = await submit(link.tutor.token, link.guardianId, [birth]).expect(400);
    expect(code(missing)).toBe('GUARDIAN_LINK_ORDER_REQUIRED');
    const order = await cleanPiece(link.guardianId, link.tutor.userId, 'guardianship_order');
    await submit(link.tutor.token, link.guardianId, [birth, order]).expect(202);
  });

  it('nouvelle invitation de l’enfant : le dépôt en cours est retiré, la fiche revient à `declared`', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    await call('post', '/players/me/guardian/invitation', link.child.token).expect(202);
    const { rows } = await harness.db.query<{ status: string }>(
      'SELECT status FROM guardian_link_reviews WHERE guardian_id = $1',
      [link.guardianId],
    );
    expect(rows.map((row) => row.status)).toEqual(['withdrawn']);
    expect((await guardianRow(link.guardianId))?.verification_status).toBe('declared');
  });
});

describe('revue par un administrateur (R1, R2, R4)', () => {
  it('file : administrateur seulement ; les pièces y figurent', async () => {
    const link = await pendingLink();
    const piece = await cleanPiece(link.guardianId, link.tutor.userId);
    await submit(link.tutor.token, link.guardianId, [piece]).expect(202);
    await queue(link.tutor.token).expect(403);
    const reviewer = await admin();
    const listed = await queue(reviewer.token).expect(200);
    const entry = (
      listed.body as { reviews: { documentIds: string[]; childFirstName: string }[] }
    ).reviews.find((review) => review.childFirstName === link.child.firstName);
    expect(entry?.documentIds).toEqual([piece]);
  });

  it('approbation : compte et rôle posés, fiche `in_review`, jamais `verified`, avis au tuteur', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const reviewer = await admin();
    const decided = await decide(reviewer, await reviewIdOf(link.guardianId), {
      decision: 'approve',
    }).expect(200);
    expect(decided.body).toEqual({ status: 'approved', closed: false });
    expect(await guardianRow(link.guardianId)).toEqual({
      user_id: link.tutor.userId,
      verification_status: 'in_review',
    });
    const { rows } = await harness.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1 AND role = 'guardian'`,
      [link.tutor.userId],
    );
    expect(rows[0]?.n).toBe(1);
    const mail = await harness.mailTo(link.tutor.address, APPROVED);
    expect(mail).toContain(link.child.firstName);
    expect(mail).not.toContain('Famillelien');
    const listed = await call('get', '/guardians/me/children', link.tutor.token).expect(200);
    expect((listed.body as { children: unknown[] }).children[0]).toMatchObject({
      linkStatus: 'approved',
      ozId: link.child.ozId,
      guardianVerified: false,
      published: false,
    });
    const [audit] = await auditOf('guardian.link.approved', reviewer.userId);
    expect(audit?.metadata).toHaveProperty('review_id');
  });

  it('lien approuvé mais tuteur non vérifié : pas de suppression de la fiche de l’enfant', async () => {
    const link = await approvedLink();
    const response = await call(
      'post',
      `/players/${link.child.ozId}/deletion`,
      link.tutor.token,
    ).send({ password: PASSWORD });
    expect([403, 404]).toContain(response.status);
  });

  it('refus : motif exigé, fiche `rejected`, nouveau dépôt possible ; au 3e refus, rattachement clos', async () => {
    const link = await pendingLink();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await submit(link.tutor.token, link.guardianId, [
        await cleanPiece(link.guardianId, link.tutor.userId),
      ]).expect(202);
      const reviewId = await reviewIdOf(link.guardianId);
      const reviewer = await admin();
      await call('post', `/admin/guardian-links/${reviewId}/decision`, reviewer.token)
        .send({ decision: 'reject', password: PASSWORD })
        .expect(422);
      const decided = await decide(reviewer, reviewId, {
        decision: 'reject',
        reason: 'illegible',
      }).expect(200);
      expect(decided.body).toEqual({ status: 'rejected', closed: attempt === 3 });
      expect((await guardianRow(link.guardianId))?.verification_status).toBe('rejected');
    }
    const closed = await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(404);
    expect(code(closed)).toBe('GUARDIAN_LINK_NOT_FOUND');
    expect(await harness.mailTo(link.tutor.address, REFUSED)).toContain('nouvelle invitation');
  });

  it('faux suspecté : rattachement clos dès le premier refus, alerte sécurité', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const reviewId = await reviewIdOf(link.guardianId);
    const decided = await decide(await admin(), reviewId, {
      decision: 'reject',
      reason: 'suspected_forgery',
    }).expect(200);
    expect(decided.body).toEqual({ status: 'rejected', closed: true });
    expect(JSON.stringify(harness.logs.lines())).toContain('guardian.link.suspected_forgery');
  });

  it('le déposant ne décide pas de son propre dépôt, même administrateur', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const setup = await call('post', '/auth/2fa/setup', link.tutor.token).expect(200);
    const { secret } = setup.body as { secret: string };
    await call('post', '/auth/2fa/enable', link.tutor.token)
      .send({ code: generateTotpCode(secret, Date.now() - STEP_MS) })
      .expect(200);
    await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [
      link.tutor.userId,
    ]);
    const response = await decide({ ...link.tutor, secret }, await reviewIdOf(link.guardianId), {
      decision: 'approve',
    }).expect(403);
    expect(code(response)).toBe('GUARDIAN_REVIEW_CONFLICT');
    expect((await guardianRow(link.guardianId))?.user_id).toBeNull();
  });

  it('ré-authentification fausse : 403, rien de décidé', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const reviewer = await admin();
    const reviewId = await reviewIdOf(link.guardianId);
    await call('post', `/admin/guardian-links/${reviewId}/decision`, reviewer.token)
      .send({ decision: 'approve', password: 'mauvais mot de passe' })
      .expect(403);
    expect((await guardianRow(link.guardianId))?.user_id).toBeNull();
  });

  it('deux décisions concurrentes : une seule réussit', async () => {
    const link = await pendingLink();
    await submit(link.tutor.token, link.guardianId, [
      await cleanPiece(link.guardianId, link.tutor.userId),
    ]).expect(202);
    const reviewId = await reviewIdOf(link.guardianId);
    const [first, second] = await Promise.all([admin(), admin()]);
    const results = await Promise.all([
      decide(first, reviewId, { decision: 'approve' }),
      decide(second, reviewId, { decision: 'reject', reason: 'illegible' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });
});

describe('consentement versionné et révocation (EX-108 n° 3 à 5, CP-13)', () => {
  it('texte en vigueur : version provisoire, empreinte SHA-256 du texte rendu', async () => {
    const current = await text('guardian_data_processing');
    expect(current.version).toBe('v1-provisoire');
    expect(current.sha256).toBe(createHash('sha256').update(current.body, 'utf8').digest('hex'));
    await call('get', '/consent-texts/terms_of_service/current').expect(422);
  });

  it('rattachement en attente (lien non approuvé) : aucun consentement possible', async () => {
    const link = await pendingLink();
    const response = await consent(link, 'guardian_data_processing', 404);
    expect(code(response)).toBe('GUARDIAN_LINK_NOT_FOUND');
  });

  it('heure de la base, texte périmé refusé, idempotent', async () => {
    const link = await approvedLink();
    const stale = await consent(link, 'guardian_data_processing', 409, {
      sha256: 'f'.repeat(64),
    });
    expect(code(stale)).toBe('CONSENT_TEXT_STALE');
    const before = Date.now();
    const granted = await consent(link, 'guardian_data_processing', 201);
    const body = granted.body as { grantedAt: string; textVersion: string };
    expect(body.textVersion).toBe('v1-provisoire');
    expect(Math.abs(new Date(body.grantedAt).getTime() - before)).toBeLessThan(60_000);
    const again = await consent(link, 'guardian_data_processing', 201);
    expect((again.body as { grantedAt: string }).grantedAt).toBe(body.grantedAt);
    const { rows } = await harness.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM consents WHERE player_id = $1',
      [link.child.playerId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('publication sans consentement au traitement : 409', async () => {
    const link = await approvedLink();
    const response = await consent(link, 'guardian_profile_publication', 409);
    expect(code(response)).toBe('CONSENT_REQUIRES_DATA_PROCESSING');
  });

  it('tuteur `in_review` : consentements enregistrés, profil toujours non publié (CP-13, R5)', async () => {
    const link = await approvedLink();
    await consent(link, 'guardian_data_processing', 201);
    await consent(link, 'guardian_profile_publication', 201);
    expect(await published(link.child.playerId)).toBe(false);
    await harness.db.query(`UPDATE players SET verification_status = 'verified' WHERE id = $1`, [
      link.child.playerId,
    ]);
    expect(await published(link.child.playerId)).toBe(false);
  });

  it('révocation : dépublication immédiate ; retirer le traitement retire la publication', async () => {
    const link = await approvedLink();
    await consent(link, 'guardian_data_processing', 201);
    await consent(link, 'guardian_profile_publication', 201);
    await verifyAll(link);
    expect(await published(link.child.playerId)).toBe(true);
    const revoked = await call(
      'delete',
      `/guardians/me/children/${link.child.ozId}/consents/guardian_data_processing`,
      link.tutor.token,
    ).expect(200);
    expect(revoked.body).toEqual({ revoked: 2 });
    expect(await published(link.child.playerId)).toBe(false);
    const nothing = await call(
      'delete',
      `/guardians/me/children/${link.child.ozId}/consents/guardian_profile_publication`,
      link.tutor.token,
    ).expect(200);
    expect(nothing.body).toEqual({ revoked: 0 });
    const [audit] = await auditOf('guardian.consent.revoked', link.tutor.userId);
    expect(audit?.metadata).toMatchObject({ revoked: 2 });
  });

  it('un autre compte ne consent ni ne révoque pour cet enfant', async () => {
    const link = await approvedLink();
    const stranger = await signedIn('inconnu');
    await call(
      'delete',
      `/guardians/me/children/${link.child.ozId}/consents/guardian_data_processing`,
      stranger.token,
    ).expect(404);
    const other = { ...link, tutor: stranger };
    await consent(other, 'guardian_data_processing', 404);
  });

  it('deux enfants, un même compte : deux fiches tuteur, chacune revue séparément (EX-108 n° 6)', async () => {
    const first = await approvedLink();
    const second = await minor();
    const invited = await call('post', '/players/me/guardian/invitation', second.token).expect(202);
    await call('post', '/guardians/invitations/accept', first.tutor.token)
      .send({ token: tokenIn((invited.body as { link: string }).link) })
      .expect(200);
    const listed = await call('get', '/guardians/me/children', first.tutor.token).expect(200);
    const statuses = (
      listed.body as { children: { linkStatus: string; guardianId: string }[] }
    ).children.map((child) => child.linkStatus);
    expect(statuses).toEqual(['approved', 'awaiting_documents']);
    await consent(
      { child: second, tutor: first.tutor, guardianId: '' },
      'guardian_data_processing',
      404,
    );
  });

  it('compte du tuteur clos : consentements retirés, profil dépublié', async () => {
    const link = await approvedLink();
    await consent(link, 'guardian_data_processing', 201);
    await consent(link, 'guardian_profile_publication', 201);
    await verifyAll(link);
    expect(await published(link.child.playerId)).toBe(true);
    await harness.db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [
      link.tutor.userId,
    ]);
    const { rows } = await harness.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM consents WHERE player_id = $1 AND revoked_at IS NULL',
      [link.child.playerId],
    );
    expect(rows[0]?.n).toBe(0);
    expect(await published(link.child.playerId)).toBe(false);
  });
});

// Décision C6 (lot 1.7bc) : un administrateur retire un lien approuvé par erreur.
const REVOKED = 'Votre lien avec votre enfant a été retiré';

async function approvedReviewOf(guardianId: string): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `SELECT id FROM guardian_link_reviews WHERE guardian_id = $1 AND status = 'approved'`,
    [guardianId],
  );
  return rows[0]?.id ?? '';
}

const revoke = (
  reviewer: Account & { readonly secret: string },
  reviewId: string,
  body: Record<string, unknown> = { reason: 'approved_in_error' },
) =>
  call('post', `/admin/guardian-links/${reviewId}/revocation`, reviewer.token).send({
    password: PASSWORD,
    code: generateTotpCode(reviewer.secret, Date.now()),
    ...body,
  });

const guardianRoles = async (userId: string): Promise<number> =>
  (
    await harness.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_roles
       WHERE user_id = $1 AND role = 'guardian' AND deleted_at IS NULL`,
      [userId],
    )
  ).rows[0]?.n ?? -1;

describe('retrait d’un lien approuvé par erreur (décision C6)', () => {
  it('lien retiré : fiche `declared` sans compte, accords révoqués, rôle retiré, l’enfant réinvite', async () => {
    const link = await approvedLink();
    await consent(link, 'guardian_data_processing', 201);
    await consent(link, 'guardian_profile_publication', 201);
    await verifyAll(link);
    expect(await published(link.child.playerId)).toBe(true);
    const reviewId = await approvedReviewOf(link.guardianId);
    const reviewer = await admin();
    const revoked = await revoke(reviewer, reviewId).expect(200);
    expect(revoked.body).toEqual({ status: 'revoked' });
    expect(await guardianRow(link.guardianId)).toEqual({
      user_id: null,
      verification_status: 'declared',
    });
    expect(await published(link.child.playerId)).toBe(false);
    const { rows: active } = await harness.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM consents WHERE player_id = $1 AND revoked_at IS NULL',
      [link.child.playerId],
    );
    expect(active[0]?.n).toBe(0);
    expect(await guardianRoles(link.tutor.userId)).toBe(0);
    const { rows: review } = await harness.db.query<{
      status: string;
      revocation_reason: string;
      revoked_by: string;
      kept: boolean;
    }>(
      `SELECT r.status, r.revocation_reason, r.revoked_by::text,
         bool_and(d.retention_until > now() + interval '170 days') AS kept
       FROM guardian_link_reviews r
       JOIN guardian_link_review_documents l ON l.review_id = r.id
       JOIN documents d ON d.id = l.document_id
       WHERE r.id = $1 GROUP BY r.id`,
      [reviewId],
    );
    expect(review[0]).toEqual({
      status: 'revoked',
      revocation_reason: 'approved_in_error',
      revoked_by: reviewer.userId,
      kept: true,
    });
    const listed = await call('get', '/guardians/me/children', link.tutor.token).expect(200);
    expect((listed.body as { children: unknown[] }).children).toEqual([]);
    await call('post', '/players/me/guardian/invitation', link.child.token).expect(202);
    const mail = await harness.mailTo(link.tutor.address, REVOKED);
    expect(mail).toContain(link.child.firstName);
    expect(mail).not.toContain('Famillelien');
    const [audit] = await auditOf('guardian.link.revoked', reviewer.userId);
    expect(audit?.metadata).toMatchObject({ review_id: reviewId, reason: 'approved_in_error' });
    expect(JSON.stringify(audit?.metadata)).not.toContain(link.child.playerId);
  });

  it('le rôle tuteur reste s’il sert encore à un autre lien approuvé', async () => {
    const first = await approvedLink();
    const second = await minor();
    const invited = await call('post', '/players/me/guardian/invitation', second.token).expect(202);
    await call('post', '/guardians/invitations/accept', first.tutor.token)
      .send({ token: tokenIn((invited.body as { link: string }).link) })
      .expect(200);
    const listed = await call('get', '/guardians/me/children', first.tutor.token).expect(200);
    const pending = (
      listed.body as { children: { linkStatus: string; guardianId: string }[] }
    ).children.find((child) => child.linkStatus === 'awaiting_documents');
    const otherGuardian = pending?.guardianId ?? '';
    await submit(first.tutor.token, otherGuardian, [
      await cleanPiece(otherGuardian, first.tutor.userId),
    ]).expect(202);
    await decide(await admin(), await reviewIdOf(otherGuardian), { decision: 'approve' }).expect(
      200,
    );
    await revoke(await admin(), await approvedReviewOf(first.guardianId)).expect(200);
    expect(await guardianRoles(first.tutor.userId)).toBe(1);
    expect(await guardianRow(otherGuardian)).toMatchObject({ user_id: first.tutor.userId });
  });

  it('ré-authentification fausse, ou motif absent ou hors liste : rien n’est retiré', async () => {
    const link = await approvedLink();
    const reviewId = await approvedReviewOf(link.guardianId);
    const reviewer = await admin();
    const wrong = await revoke(reviewer, reviewId, {
      reason: 'approved_in_error',
      password: 'mauvais mot de passe',
    }).expect(403);
    expect(code(wrong)).toBe('GUARDIAN_REAUTH_REJECTED');
    await revoke(reviewer, reviewId, { reason: undefined }).expect(422);
    await revoke(reviewer, reviewId, { reason: 'texte libre' }).expect(422);
    expect(await guardianRow(link.guardianId)).toMatchObject({ user_id: link.tutor.userId });
  });

  it('dépôt non approuvé, déjà retiré ou inconnu ; non-administrateur ; administrateur concerné', async () => {
    const pending = await pendingLink();
    await submit(pending.tutor.token, pending.guardianId, [
      await cleanPiece(pending.guardianId, pending.tutor.userId),
    ]).expect(202);
    const notApproved = await revoke(await admin(), await reviewIdOf(pending.guardianId)).expect(
      409,
    );
    expect(code(notApproved)).toBe('GUARDIAN_REVOCATION_CONFLICT');
    await revoke(await admin(), '01900000-0000-7000-8000-000000000000').expect(404);
    const link = await approvedLink();
    const reviewId = await approvedReviewOf(link.guardianId);
    await call('post', `/admin/guardian-links/${reviewId}/revocation`, link.tutor.token)
      .send({ reason: 'approved_in_error', password: PASSWORD })
      .expect(403);
    // Le tuteur concerné, devenu administrateur, ne retire pas son propre lien.
    const setup = await call('post', '/auth/2fa/setup', link.tutor.token).expect(200);
    const { secret } = setup.body as { secret: string };
    await call('post', '/auth/2fa/enable', link.tutor.token)
      .send({ code: generateTotpCode(secret, Date.now() - STEP_MS) })
      .expect(200);
    await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [
      link.tutor.userId,
    ]);
    const self = await revoke({ ...link.tutor, secret }, reviewId).expect(403);
    expect(code(self)).toBe('GUARDIAN_REVIEW_CONFLICT');
    await revoke(await admin(), reviewId).expect(200);
    const again = await revoke(await admin(), reviewId).expect(409);
    expect(code(again)).toBe('GUARDIAN_REVOCATION_CONFLICT');
  });
});
