import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { readableDocumentFor, recordDocumentRead } from '../src/document-read.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Lecture des documents (lot 1.9ca, tâche 2) : `purged_at` réservé au chemin privilégié, lecture de
// l'administrateur, pièce lisible seulement saine, ni supprimée ni purgée, et audit de la lecture.

let db: TestDatabase;
let app: AppConnection;
/** Connexion de l'API (`oz_app`), soumise à la RLS. */
let api: PrismaClient;
let ids: {
  owner: string;
  stranger: string;
  admin: string;
  organization: string;
  adult: string;
};

const SHA = 'ef'.repeat(32);
const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

/** Pièce d'identité du joueur `ids.adult`, au statut demandé (clé `clean/<id>` si saine). */
const document = async (
  status: 'pending' | 'clean' | 'infected' | 'rejected' | 'error' = 'clean',
  subject: { player?: string; organization?: string } = {},
): Promise<string> =>
  (
    await one<{ id: string }>(
      `WITH n AS (SELECT oz_uuid_v7() AS id)
       INSERT INTO documents (id, type, player_id, organization_id, uploaded_by, storage_key, mime_type,
         size_bytes, sha256, av_status, rejection_reason, retention_until)
       SELECT n.id, CASE WHEN $2::uuid IS NULL THEN 'identity_document' ELSE 'organization_registration' END::document_type,
         $1, $2, $3, CASE WHEN $4 = 'clean' THEN 'clean/' ELSE 'quarantine/' END || n.id,
         'image/png', 2048, $5, $4::av_status, CASE WHEN $4 = 'rejected' THEN 'pages' END,
         now() + interval '90 days'
       FROM n RETURNING id::text`,
      [
        subject.organization === undefined ? (subject.player ?? ids.adult) : null,
        subject.organization ?? null,
        ids.owner,
        status,
        SHA,
      ],
    )
  ).id;

const readAs = (userId: string, id: string) =>
  withUserContext(api, userId, (tx) => readableDocumentFor(tx, id));

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const apiUrl = new URL(db.url);
  apiUrl.username = 'oz_app_test';
  apiUrl.password = 'oz_app_test';
  api = createDbClient(apiUrl.toString());

  const user = async (email: string, role?: string): Promise<string> => {
    const id = (
      await one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
    ).id;
    if (role !== undefined) {
      await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2::role_kind)`, [
        id,
        role,
      ]);
    }
    return id;
  };
  const owner = await user('titulaire-lecture@example.test', 'player');
  const organization = (
    await one<{ id: string }>(
      `INSERT INTO organizations (type, name, country, verification_status)
       VALUES ('club', 'Club synthétique', 'CM', 'verified') RETURNING id`,
    )
  ).id;
  ids = {
    owner,
    stranger: await user('tiers-lecture@example.test', 'player'),
    admin: await user('admin-lecture@example.test', 'admin'),
    organization,
    adult: (
      await one<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
         VALUES ($1, 'Joueur', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id`,
        [owner],
      )
    ).id,
  };
}, 180_000);

afterAll(async () => {
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('purged_at', () => {
  it('jamais écrit sous contexte utilisateur ni par l’API hors chemin privilégié', async () => {
    const id = await document();
    await expect(
      app.as(ids.owner, (client) =>
        client.query('UPDATE documents SET purged_at = now() WHERE id = $1', [id]),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.as(null, (client) =>
        client.query('UPDATE documents SET purged_at = now() WHERE id = $1', [id]),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    expect(
      (
        await one<{ purged: boolean }>(
          'SELECT purged_at IS NOT NULL AS purged FROM documents WHERE id = $1',
          [id],
        )
      ).purged,
    ).toBe(false);
  });

  it('posé une fois par le chemin privilégié, jamais retiré ni déplacé', async () => {
    const id = await document();
    await db.query('UPDATE documents SET purged_at = now() WHERE id = $1', [id]);
    await expect(
      db.query('UPDATE documents SET purged_at = NULL WHERE id = $1', [id]),
    ).rejects.toThrow(/purge/);
    await expect(
      db.query(`UPDATE documents SET purged_at = now() + interval '1 day' WHERE id = $1`, [id]),
    ).rejects.toThrow(/purge/);
  });
});

describe('lecture permise', () => {
  it('le titulaire lit sa pièce saine : type, type de contenu, clé `clean/`, cible', async () => {
    const id = await document();
    const read = await readAs(ids.owner, id);
    expect(read).toMatchObject({
      id,
      type: 'identity_document',
      mimeType: 'image/png',
      storageKey: `clean/${id}`,
      target: { kind: 'player', ownerUserId: ids.owner },
    });
  });

  it('l’administrateur voit la pièce d’un joueur et le justificatif d’une organisation', async () => {
    const own = await document();
    const registration = await document('clean', { organization: ids.organization });
    expect(await readAs(ids.admin, own)).toMatchObject({ id: own });
    expect(await readAs(ids.admin, registration)).toMatchObject({
      id: registration,
      target: { kind: 'organization', organizationId: ids.organization },
    });
  });

  it('l’administrateur voit la pièce d’un tuteur sans voir sa fiche', async () => {
    const guardian = (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
         VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
        [ids.stranger],
      )
    ).id;
    const id = (
      await one<{ id: string }>(
        `WITH n AS (SELECT oz_uuid_v7() AS id)
         INSERT INTO documents (id, type, guardian_id, uploaded_by, storage_key, mime_type, size_bytes,
           sha256, av_status, retention_until)
         SELECT n.id, 'identity_document', $1, $2, 'clean/' || n.id, 'image/png', 2048, $3, 'clean',
           now() + interval '90 days'
         FROM n RETURNING id::text`,
        [guardian, ids.stranger, SHA],
      )
    ).id;
    expect(await readAs(ids.admin, id)).toMatchObject({
      id,
      target: { kind: 'guardian', ownerUserId: null, organizationId: null },
    });
    expect(await readAs(ids.owner, id)).toBeNull();
  });

  it('un tiers sans lien ne voit rien', async () => {
    expect(await readAs(ids.stranger, await document())).toBeNull();
  });
});

describe('lecture refusée (CP-21)', () => {
  it.each(['pending', 'infected', 'rejected', 'error'] as const)(
    'statut %s : rien',
    async (status) => {
      expect(await readAs(ids.owner, await document(status))).toBeNull();
      expect(await readAs(ids.admin, await document(status))).toBeNull();
    },
  );

  it('supprimée ou purgée : rien', async () => {
    const removed = await document();
    await db.query('UPDATE documents SET deleted_at = now() WHERE id = $1', [removed]);
    const purged = await document();
    await db.query('UPDATE documents SET purged_at = now() WHERE id = $1', [purged]);
    expect(await readAs(ids.owner, removed)).toBeNull();
    expect(await readAs(ids.owner, purged)).toBeNull();
    expect(await readAs(ids.admin, purged)).toBeNull();
  });

  it('conservation échue, même pas encore purgée : rien (lot 1.9cb, D-101)', async () => {
    const { id: due } = await one<{ id: string }>(
      `WITH n AS (SELECT oz_uuid_v7() AS id)
       INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes,
         sha256, av_status, created_at, retention_until)
       SELECT n.id, 'identity_document', $1, $2, 'clean/' || n.id, 'image/png', 2048, $3, 'clean',
         now() - interval '100 days', now() - interval '1 second'
       FROM n RETURNING id::text`,
      [ids.adult, ids.owner, SHA],
    );
    expect(await readAs(ids.owner, due)).toBeNull();
    expect(await readAs(ids.admin, due)).toBeNull();
  });

  it('identifiant inconnu ou mal formé : rien', async () => {
    expect(await readAs(ids.owner, '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192')).toBeNull();
    expect(await readAs(ids.owner, 'pas-un-uuid')).toBeNull();
  });
});

describe('sujet supprimé ou rattachement (revue adverse du lot 1.9ca)', () => {
  const guardianDocument = async (): Promise<{ guardian: string; id: string }> => {
    const guardian = (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
         VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
        [ids.stranger],
      )
    ).id;
    const id = (
      await one<{ id: string }>(
        `WITH n AS (SELECT oz_uuid_v7() AS id)
         INSERT INTO documents (id, type, guardian_id, uploaded_by, storage_key, mime_type, size_bytes,
           sha256, av_status, retention_until)
         SELECT n.id, 'identity_document', $1, $2, 'clean/' || n.id, 'image/png', 2048, $3, 'clean',
           now() + interval '90 days'
         FROM n RETURNING id::text`,
        [guardian, ids.stranger, SHA],
      )
    ).id;
    return { guardian, id };
  };

  it('administrateur : rien pour une pièce dont le tuteur ou l’organisation est supprimé', async () => {
    const { guardian, id } = await guardianDocument();
    await db.query('UPDATE guardians SET deleted_at = now() WHERE id = $1', [guardian]);
    expect(await readAs(ids.admin, id)).toBeNull();
    const organization = (
      await one<{ id: string }>(
        `INSERT INTO organizations (type, name, country, verification_status, deleted_at)
         VALUES ('club', 'Club supprimé', 'CM', 'verified', now()) RETURNING id`,
      )
    ).id;
    expect(await readAs(ids.admin, await document('clean', { organization }))).toBeNull();
  });

  it('administrateur : rien pour la pièce d’un joueur supprimé', async () => {
    const removed = (
      await one<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status, deleted_at)
         VALUES (NULL, 'Retiré', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared', now()) RETURNING id`,
      )
    ).id;
    expect(await readAs(ids.admin, await document('clean', { player: removed }))).toBeNull();
  });

  it('la lecture administrateur n’ouvre pas le rattachement d’une pièce tierce à un dossier KYC', async () => {
    const kycCase = (
      await one<{ id: string }>(
        `INSERT INTO kyc_cases (player_id, level) VALUES ($1, 1) RETURNING id`,
        [ids.adult],
      )
    ).id;
    const { id } = await guardianDocument();
    await expect(
      app.as(ids.admin, (client) =>
        client.query(`INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)`, [
          kycCase,
          id,
        ]),
      ),
    ).rejects.toThrow(/ne concerne pas le sujet/);
    // Le titulaire rattache toujours sa propre pièce à son dossier.
    const own = await document();
    await app.as(ids.owner, (client) =>
      client.query(`INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)`, [
        kycCase,
        own,
      ]),
    );
  });
});

describe('audit de la lecture', () => {
  it('inscrit `document.read.granted` au nom de l’acteur, sans clé ni URL', async () => {
    const id = await document();
    await withUserContext(api, ids.admin, (tx) =>
      recordDocumentRead(tx, ids.admin, { id, type: 'identity_document' }),
    );
    const rows = await db.query<{
      action: string;
      actor_user_id: string;
      target_type: string;
      reason: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, actor_user_id::text, target_type, reason, metadata FROM audit_log
       WHERE target_id = $1 AND action = 'document.read.granted'`,
      [id],
    );
    expect(rows).toEqual([
      {
        action: 'document.read.granted',
        actor_user_id: ids.admin,
        target_type: 'document',
        reason: 'Lecture accordée',
        metadata: { document_type: 'identity_document' },
      },
    ]);
  });

  it('refusé au nom d’un autre compte', async () => {
    const id = await document();
    await expect(
      withUserContext(api, ids.owner, (tx) =>
        recordDocumentRead(tx, ids.admin, { id, type: 'identity_document' }),
      ),
    ).rejects.toThrow();
  });
});
