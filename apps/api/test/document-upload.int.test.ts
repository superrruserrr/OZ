import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RbacRole } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import { incomingKey, quarantineKey, type DocumentStorage } from '@oz/storage';
import { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { API_CONFIG } from '../src/config/config.module.js';
import { DOCUMENT_STORAGE } from '../src/document/document.tokens.js';
import { DOCUMENT_SCAN_QUEUE, ScanQueue } from '../src/document/scan-queue.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Parcours de dépôt (lot 1.9a, EX-110) sur la pile réelle : PostgreSQL, Redis, SeaweedFS.

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// Faux fichiers : en-tête PDF, en-tête d'exécutable Windows (MZ … PE).
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const EXE = Uint8Array.from({ length: 256 }, (_, index) =>
  index === 0 ? 0x4d : index === 1 ? 0x5a : index === 0x3c ? 0x80 : 0,
).map((byte, index) =>
  index >= 0x80 && index < 0x84 ? ([0x50, 0x45, 0, 0][index - 0x80] ?? 0) : byte,
);

let harness: AuthHarness;
let server: App;
let storage: DocumentStorage;
let queue: Queue;
let counter = 0;

interface Account {
  readonly userId: string;
  readonly token: string;
}

async function account(role?: RbacRole, organizationId: string | null = null): Promise<Account> {
  const address = `depot-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  const { rows } = await harness.db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    address,
  ]);
  const userId = rows[0]?.id ?? '';
  // Connexion d'abord : les rôles sont relus en base à chaque requête, sans nouveau jeton.
  const login = await request(server)
    .post('/auth/login')
    .send({ email: address, password: PASSWORD })
    .expect(200);
  if (role !== undefined) {
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`,
      [userId, role, organizationId],
    );
    // Rôles à 2FA obligatoire : posée ici, le parcours d'enrôlement a sa propre suite.
    await harness.db.query(
      `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
      [userId],
    );
  }
  return { userId, token: (login.body as { accessToken: string }).accessToken };
}

async function player(userId: string | null, birthDate = '1995-03-04'): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
     VALUES ($1, 'Joueur', 'Synthétique', $2, 'CM', 'CM', 'declared') RETURNING id`,
    [userId, birthDate],
  );
  return rows[0]?.id ?? '';
}

const intent = (token: string | undefined, body: object) => {
  const pending = request(server).post('/documents/upload').set('Origin', ORIGIN).send(body);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

const pngFor = (playerId: string, bytes: Uint8Array = PNG) => ({
  documentType: 'identity_document',
  playerId,
  contentType: 'image/png',
  sizeBytes: bytes.length,
  sha256: sha256(bytes),
});

const uploadsBy = async (userId: string): Promise<number> =>
  Number(
    (
      await harness.db.query<{ n: string }>(
        `SELECT count(*) AS n FROM document_uploads WHERE requested_by = $1`,
        [userId],
      )
    ).rows[0]?.n,
  );

const errorCode = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

interface Issued {
  readonly uploadId: string;
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly expiresAt: string;
}

/** Envoi direct au stockage ; `fetch` pose lui-même `content-length`. */
async function put(issued: Issued, body: Uint8Array): Promise<number> {
  const headers = Object.fromEntries(
    Object.entries(issued.headers).filter(([name]) => name !== 'content-length'),
  );
  const response = await fetch(issued.url, { method: 'PUT', headers, body });
  await response.arrayBuffer();
  return response.status;
}

beforeAll(async () => {
  harness = await startAuthHarness({ FEATURE_DOCUMENTS: 'true' });
  server = harness.app.getHttpServer();
  storage = harness.app.get<DocumentStorage>(DOCUMENT_STORAGE, { strict: false });
  queue = new Queue(DOCUMENT_SCAN_QUEUE, { connection: harness.redis });
}, 240_000);
afterAll(async () => {
  await queue.close();
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('POST /documents/upload', () => {
  it('le joueur obtient une URL PUT de 5 minutes ; le stockage accepte le fichier déclaré', async () => {
    const owner = await account('player');
    const playerId = await player(owner.userId);
    const before = Date.now();
    const response = await intent(owner.token, pngFor(playerId)).expect(201);
    const issued = response.body as Issued;
    expect(issued.method).toBe('PUT');
    expect(Object.keys(issued.headers).sort()).toEqual([
      'content-length',
      'content-type',
      'x-amz-checksum-sha256',
    ]);
    expect(issued.headers['x-amz-checksum-sha256']).toBe(
      Buffer.from(sha256(PNG), 'hex').toString('base64'),
    );
    const expiresIn = Date.parse(issued.expiresAt) - before;
    expect(expiresIn).toBeGreaterThan(290_000);
    expect(expiresIn).toBeLessThanOrEqual(301_000);
    // Seule l'URL signée désigne l'objet ; aucune clé de stockage en champ propre.
    expect(Object.keys(response.body as object).sort()).toEqual([
      'expiresAt',
      'headers',
      'method',
      'uploadId',
      'url',
    ]);

    const { rows } = await harness.db.query<{ status: string; seconds: number }>(
      `SELECT status::text, extract(epoch FROM expires_at - created_at)::int AS seconds
       FROM document_uploads WHERE id = $1`,
      [issued.uploadId],
    );
    expect(rows).toEqual([{ status: 'issued', seconds: 300 }]);
    expect(await put(issued, PNG)).toBe(200);
  });

  it('le stockage refuse un autre fichier que celui déclaré', async () => {
    const owner = await account('player');
    const playerId = await player(owner.userId);
    const issued = (await intent(owner.token, pngFor(playerId)).expect(201)).body as Issued;
    const other = Uint8Array.from(PNG);
    other[PNG.length - 1] = 0;
    expect(await put(issued, other)).toBeGreaterThanOrEqual(400);
  });

  it('journal d’audit : intention émise, sans URL ni signature', async () => {
    const owner = await account('player');
    const playerId = await player(owner.userId);
    const issued = (await intent(owner.token, pngFor(playerId)).expect(201)).body as Issued;
    const { rows } = await harness.db.query<{ actor: string; metadata: object }>(
      `SELECT actor_user_id::text AS actor, metadata FROM audit_log
       WHERE action = 'document.upload.issued' AND target_id = $1`,
      [issued.uploadId],
    );
    expect(rows).toEqual([
      {
        actor: owner.userId,
        metadata: {
          document_type: 'identity_document',
          content_type: 'image/png',
          size_bytes: 67,
          player_id: playerId,
          guardian_id: null,
          organization_id: null,
        },
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/X-Amz|https?:/);
  });

  it('sans droit sur la cible, cible inconnue ou mal formée : 404, aucune intention', async () => {
    const owner = await account('player');
    const other = await account('player');
    const otherPlayer = await player(other.userId);
    for (const playerId of [otherPlayer, '00000000-0000-4000-8000-000000000009']) {
      const response = await intent(owner.token, pngFor(playerId)).expect(404);
      expect(errorCode(response)).toBe('NOT_FOUND');
    }
    await intent(owner.token, pngFor('x')).expect(422);
    expect(await uploadsBy(owner.userId)).toBe(0);
  });

  it('le tuteur dépose pour son enfant mineur, plus après sa majorité', async () => {
    const guardian = await account('guardian');
    const { rows } = await harness.db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
      [guardian.userId],
    );
    const guardianId = rows[0]?.id ?? '';
    const child = await player(null, '2014-05-06');
    const adult = await player(null, '2000-05-06');
    await harness.db.query(`UPDATE players SET guardian_id = $1 WHERE id = ANY($2::uuid[])`, [
      guardianId,
      [child, adult],
    ]);
    await intent(guardian.token, pngFor(child)).expect(201);
    await intent(guardian.token, pngFor(adult)).expect(404);
    await intent(guardian.token, {
      ...pngFor(child),
      playerId: undefined,
      guardianId,
    }).expect(201);
  });

  it('tuteur déclaré mais non vérifié : 404 pour l’enfant, son propre profil reste ouvert', async () => {
    const guardian = await account('guardian');
    const { rows } = await harness.db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'Déclaré', 'father', 'CM') RETURNING id`,
      [guardian.userId],
    );
    const guardianId = rows[0]?.id ?? '';
    const child = await player(null, '2014-05-06');
    await harness.db.query(`UPDATE players SET guardian_id = $1 WHERE id = $2`, [
      guardianId,
      child,
    ]);
    await intent(guardian.token, pngFor(child)).expect(404);
    await intent(guardian.token, { ...pngFor(child), playerId: undefined, guardianId }).expect(201);
  });

  it('organisations : club et académie pour leurs rattachés et leur justificatif, recruteur pour son justificatif seul', async () => {
    const organization = async (type: string): Promise<string> =>
      (
        await harness.db.query<{ id: string }>(
          `INSERT INTO organizations (type, name, country, verification_status)
           VALUES ($1, 'Organisation synthétique', 'CM', 'verified') RETURNING id`,
          [type],
        )
      ).rows[0]?.id ?? '';
    const registration = (organizationId: string) => ({
      ...pngFor('', PDF),
      playerId: undefined,
      organizationId,
      documentType: 'organization_registration',
      contentType: 'application/pdf',
    });
    for (const role of ['club', 'academy'] as const) {
      const own = await organization(role);
      const other = await organization(role);
      const member = await account(role, own);
      const attached = await player(null);
      const elsewhere = await player(null);
      await harness.db.query(`UPDATE players SET organization_id = $1 WHERE id = $2`, [
        own,
        attached,
      ]);
      await harness.db.query(`UPDATE players SET organization_id = $1 WHERE id = $2`, [
        other,
        elsewhere,
      ]);
      await intent(member.token, pngFor(attached)).expect(201);
      await intent(member.token, pngFor(elsewhere)).expect(404);
      await intent(member.token, registration(own)).expect(201);
      await intent(member.token, registration(other)).expect(404);
    }
    const agency = await organization('agency');
    const recruiter = await account('recruiter', agency);
    await intent(recruiter.token, registration(agency)).expect(201);
    await intent(recruiter.token, pngFor(await player(null))).expect(404);
  });

  it('taille au-delà de 50 Mo ou type hors D4 : 422 avant toute écriture', async () => {
    const owner = await account('player');
    const playerId = await player(owner.userId);
    for (const override of [
      { sizeBytes: 52_428_801 },
      { documentType: 'photo', contentType: 'application/pdf' },
      { contentType: 'image/heic' },
      { documentType: 'video', contentType: 'video/mp4' },
    ]) {
      await intent(owner.token, { ...pngFor(playerId), ...override }).expect(422);
    }
    expect(await uploadsBy(owner.userId)).toBe(0);
  });

  it('au-delà de la limite par compte : 429 avec Retry-After', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      document_upload_account: { limit: 2, windowSeconds: 3600 },
    });
    const owner = await account('player');
    const playerId = await player(owner.userId);
    await intent(owner.token, pngFor(playerId)).expect(201);
    await intent(owner.token, pngFor(playerId)).expect(201);
    const refused = await intent(owner.token, pngFor(playerId)).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(await uploadsBy(owner.userId)).toBe(2);
  });

  it('sans session : 401 ; administrateur seul : 403 (D5)', async () => {
    await intent(undefined, pngFor('00000000-0000-4000-8000-000000000009')).expect(401);
    const admin = await account('admin');
    const playerId = await player(null);
    const refused = await intent(admin.token, pngFor(playerId)).expect(403);
    expect(errorCode(refused)).toBe('AUTHZ_FORBIDDEN');
  });
});

const complete = (token: string | undefined, id: string) => {
  const pending = request(server).post(`/documents/upload/${id}/complete`).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

const uploadRow = async (id: string) =>
  (
    await harness.db.query<{ status: string; reject_reason: string | null }>(
      `SELECT status::text, reject_reason FROM document_uploads WHERE id = $1`,
      [id],
    )
  ).rows[0];

/** Joueur titulaire, intention émise pour `declared`, et `sent` envoyé tel quel au stockage. */
async function deposited(
  declared: { contentType: string; bytes: Uint8Array },
  sent: Uint8Array | null = declared.bytes,
): Promise<{ owner: Account; issued: Issued }> {
  const owner = await account('player');
  const playerId = await player(owner.userId);
  const issued = (
    await intent(owner.token, {
      ...pngFor(playerId, declared.bytes),
      contentType: declared.contentType,
    }).expect(201)
  ).body as Issued;
  if (sent !== null) expect(await put(issued, sent)).toBe(200);
  return { owner, issued };
}

describe('POST /documents/upload/:id/complete', () => {
  it('réception : quarantaine, document `pending`, conservation, un job avec l’identifiant seul', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG });
    const response = await complete(owner.token, issued.uploadId).expect(201);
    const { documentId, status } = response.body as { documentId: string; status: string };
    expect(status).toBe('pending');
    expect(Object.keys(response.body as object).sort()).toEqual(['documentId', 'status']);
    expect(await storage.head(quarantineKey(documentId))).toMatchObject({ size: PNG.length });
    expect(await storage.head(incomingKey(issued.uploadId))).toBeNull();

    const { rows } = await harness.db.query<{
      status: string;
      sha256: string;
      storage_key: string;
      days: number;
    }>(
      `SELECT av_status::text AS status, sha256, storage_key,
         round(extract(epoch FROM retention_until - now()) / 86400)::int AS days
       FROM documents WHERE id = $1`,
      [documentId],
    );
    expect(rows).toEqual([
      { status: 'pending', sha256: sha256(PNG), storage_key: quarantineKey(documentId), days: 90 },
    ]);
    expect((await uploadRow(issued.uploadId))?.status).toBe('completed');
    const job = await queue.getJob(documentId);
    expect(job?.data).toEqual({ documentId });

    const again = await complete(owner.token, issued.uploadId).expect(409);
    expect(errorCode(again)).toBe('DOCUMENT_UPLOAD_USED');
  });

  it('dépôt d’un autre, inconnu ou mal formé : 404', async () => {
    const { issued } = await deposited({ contentType: 'image/png', bytes: PNG });
    const stranger = await account('player');
    for (const id of [issued.uploadId, '00000000-0000-4000-8000-000000000009', 'x', '..%2Fx']) {
      const response = await complete(stranger.token, id).expect(404);
      expect(errorCode(response)).toBe('NOT_FOUND');
    }
    expect((await uploadRow(issued.uploadId))?.status).toBe('issued');
  });

  it('aucun fichier reçu : 409, l’intention reste ouverte', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG }, null);
    const response = await complete(owner.token, issued.uploadId).expect(409);
    expect(errorCode(response)).toBe('DOCUMENT_UPLOAD_MISSING');
    expect((await uploadRow(issued.uploadId))?.status).toBe('issued');
    expect(await put(issued, PNG)).toBe(200);
    await complete(owner.token, issued.uploadId).expect(201);
  });

  it.each([
    ['PDF déclaré image/png', PDF, 'application/pdf'],
    ['exécutable déclaré image/png', EXE, 'application/x-msdownload'],
  ])(
    'fichier déguisé (%s) : rejet `type_mismatch`, objet supprimé, alerte',
    async (_label, bytes, detected) => {
      const { owner, issued } = await deposited({ contentType: 'image/png', bytes });
      const response = await complete(owner.token, issued.uploadId).expect(422);
      expect(errorCode(response)).toBe('DOCUMENT_REJECTED');
      expect(await uploadRow(issued.uploadId)).toEqual({
        status: 'rejected',
        reject_reason: 'type_mismatch',
      });
      expect(await storage.head(incomingKey(issued.uploadId))).toBeNull();
      const alert = harness.logs
        .lines()
        .find(
          (line) =>
            line.event === 'document.upload.type_mismatch' && line.uploadId === issued.uploadId,
        );
      expect(alert).toMatchObject({ declared: 'image/png', detected, userId: owner.userId });
      await complete(owner.token, issued.uploadId).expect(409);
    },
  );

  it('taille reçue différente de la taille déclarée : rejet `size_mismatch`, objet supprimé', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG }, null);
    // Écrit hors URL signée (le stockage refuserait) : simule un stockage qui n'appliquerait pas la taille.
    const { s3 } = harness.app.get<ApiConfig>(API_CONFIG, { strict: false });
    const client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      forcePathStyle: true,
      credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: incomingKey(issued.uploadId),
        Body: Uint8Array.from([...PNG, 0]),
      }),
    );
    client.destroy();
    const response = await complete(owner.token, issued.uploadId).expect(422);
    expect(errorCode(response)).toBe('DOCUMENT_REJECTED');
    expect(await uploadRow(issued.uploadId)).toEqual({
      status: 'rejected',
      reject_reason: 'size_mismatch',
    });
    expect(await storage.head(incomingKey(issued.uploadId))).toBeNull();
  });

  it('intention échue : 410, statut `expired`, objet supprimé, aucun document', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG });
    await harness.db.query(
      `UPDATE document_uploads SET created_at = now() - interval '10 minutes',
         expires_at = now() - interval '5 minutes' WHERE id = $1`,
      [issued.uploadId],
    );
    const response = await complete(owner.token, issued.uploadId).expect(410);
    expect(errorCode(response)).toBe('DOCUMENT_UPLOAD_EXPIRED');
    expect((await uploadRow(issued.uploadId))?.status).toBe('expired');
    expect(await storage.head(incomingKey(issued.uploadId))).toBeNull();
    await complete(owner.token, issued.uploadId).expect(410);
  });

  it('droit retiré depuis l’intention : 404, rien n’est enregistré', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG });
    await harness.db.query(`UPDATE players SET user_id = NULL WHERE user_id = $1`, [owner.userId]);
    await complete(owner.token, issued.uploadId).expect(404);
    expect((await uploadRow(issued.uploadId))?.status).toBe('issued');
  });
});

describe('réception : pannes et débit', () => {
  it('mise en file impossible sur la pile réelle : 503, rien d’enregistré, envoi intact, nouvel essai possible', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG });
    const scans = harness.app.get(ScanQueue, { strict: false });
    const failing = vi
      .spyOn(scans, 'enqueue')
      .mockRejectedValueOnce(new Error('redis indisponible'));
    const copy = vi.spyOn(storage, 'copy');
    const response = await complete(owner.token, issued.uploadId).expect(503);
    expect(errorCode(response)).toBe('SERVICE_UNAVAILABLE');
    failing.mockRestore();
    // La copie faite avant l'échec a été retirée : rien en quarantaine.
    const copied = copy.mock.calls[0]?.[1] ?? '';
    copy.mockRestore();
    expect(copied).toMatch(/^quarantine\//);
    expect(await storage.head(copied)).toBeNull();
    expect((await uploadRow(issued.uploadId))?.status).toBe('issued');
    const { rows } = await harness.db.query(
      `SELECT 1 FROM documents d JOIN document_uploads u ON u.requested_by = d.uploaded_by
       WHERE u.id = $1`,
      [issued.uploadId],
    );
    expect(rows).toEqual([]);
    expect(await storage.head(incomingKey(issued.uploadId))).toMatchObject({ size: PNG.length });
    const retried = await complete(owner.token, issued.uploadId).expect(201);
    expect((retried.body as { status: string }).status).toBe('pending');
    expect(await storage.head(incomingKey(issued.uploadId))).toBeNull();
  });

  it('réceptions au-delà de la limite par compte : 429 avec Retry-After', async () => {
    const { owner, issued } = await deposited({ contentType: 'image/png', bytes: PNG }, null);
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      document_complete_account: { limit: 2, windowSeconds: 3600 },
    });
    await complete(owner.token, issued.uploadId).expect(409);
    await complete(owner.token, issued.uploadId).expect(409);
    const refused = await complete(owner.token, issued.uploadId).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });
});
