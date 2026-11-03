import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { buildPdf, eicar } from '../../apps/worker/test/fixtures.js';
import { login, registerAndConfirm, syntheticEmail, syntheticPassword } from '../auth/flows.js';

// Parcours n° 10 (design.md §7.5, EX-110 n° 4 et n° 8) : un joueur téléverse un fichier infecté ;
// le worker le rejette, rien ne subsiste dans le stockage, aucune URL de lecture n'est délivrée,
// l'audit et l'alerte de sécurité sont inscrits.

// `pg` et le client S3 ne sont dépendances que de l'API : résolus depuis elle.
const fromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
interface SqlClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
const pg = fromApi('pg') as {
  Client: new (config: { connectionString: string | undefined }) => SqlClient;
};
const s3 = fromApi('@aws-sdk/client-s3') as {
  S3Client: new (config: object) => {
    send(command: object): Promise<{ Contents?: { Key?: string }[] }>;
    destroy(): void;
  };
  ListObjectsV2Command: new (input: { Bucket: string | undefined }) => object;
};

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} absent (global setup)`);
  return value;
};

test('fichier infecté → rejet, aucun objet, aucune URL, audit et alerte', async ({ request }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(request, email, password);
  const session = await login(request, email, password);
  expect(session.status()).toBe(200);
  const { accessToken } = (await session.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Profil joueur (lot 1.5 non livré) : posé en base, comme les tests d'intégration de l'API.
  const db = new pg.Client({ connectionString: env('E2E_DATABASE_URL') });
  await db.connect();
  let documentId = '';
  try {
    const [user] = (await db.query('SELECT id FROM users WHERE email = $1', [email])).rows as {
      id: string;
    }[];
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'player')`, [user?.id]);
    const [player] = (
      await db.query(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
         VALUES ($1, 'Joueur', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id`,
        [user?.id],
      )
    ).rows as { id: string }[];

    // 1. Intention de dépôt, envoi direct au stockage, réception.
    const file = buildPdf(1, { content: eicar() });
    const intent = await request.post('/documents/upload', {
      headers: auth,
      data: {
        documentType: 'identity_document',
        playerId: player?.id,
        contentType: 'application/pdf',
        sizeBytes: file.byteLength,
        sha256: createHash('sha256').update(file).digest('hex'),
      },
    });
    expect(intent.status()).toBe(201);
    const issued = (await intent.json()) as {
      uploadId: string;
      url: string;
      headers: Record<string, string>;
    };
    const sent = await request.put(issued.url, { headers: issued.headers, data: file });
    expect(sent.status()).toBe(200);
    const completed = await request.post(`/documents/upload/${issued.uploadId}/complete`, {
      headers: auth,
    });
    expect(completed.status()).toBe(201);
    ({ documentId } = (await completed.json()) as { documentId: string });

    // 2. Le worker juge le fichier infecté.
    await expect
      .poll(
        async () =>
          (
            (await db.query('SELECT av_status::text FROM documents WHERE id = $1', [
              documentId,
            ])) as { rows: { av_status: string }[] }
          ).rows[0]?.av_status,
        { timeout: 120_000, intervals: [500] },
      )
      .toBe('infected');

    // 3. Aucune URL de lecture : même 404 qu'une pièce inconnue.
    const read = await request.get(`/documents/${documentId}/url`, { headers: auth });
    expect(read.status()).toBe(404);

    // 4. Rien ne subsiste dans le stockage (quarantaine retirée juste après le verdict).
    const bucket = new s3.S3Client({
      endpoint: env('E2E_S3_ENDPOINT'),
      region: 'fr-par',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env('E2E_S3_ACCESS_KEY'),
        secretAccessKey: env('E2E_S3_SECRET_KEY'),
      },
    });
    try {
      await expect
        .poll(
          async () =>
            (
              (await bucket.send(new s3.ListObjectsV2Command({ Bucket: env('E2E_S3_BUCKET') })))
                .Contents ?? []
            )
              .map((object) => object.Key ?? '')
              .filter((key) => key.endsWith(documentId) || key.endsWith(issued.uploadId)),
          { timeout: 10_000 },
        )
        .toEqual([]);
    } finally {
      bucket.destroy();
    }

    // 5. Audit du verdict, avec la signature ; aucune lecture inscrite.
    const audit = (
      (await db.query(
        `SELECT action, metadata->>'signature' AS signature FROM audit_log
         WHERE target_id = $1 ORDER BY chain_position`,
        [documentId],
      )) as { rows: { action: string; signature: string | null }[] }
    ).rows;
    expect(audit.map((row) => row.action)).toContain('document.scan.infected');
    expect(audit.map((row) => row.action)).not.toContain('document.read.granted');
    expect(audit.find((row) => row.action === 'document.scan.infected')?.signature).toMatch(
      /eicar/i,
    );
  } finally {
    await db.end();
  }

  // 6. Alerte de sécurité du worker (niveau error) : identifiant, type, signature ; ni clé ni empreinte.
  const alerts = readFileSync(env('E2E_WORKER_LOG'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('"document.scan.infected"'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({ level: 50, documentId, documentType: 'identity_document' });
  expect(String(alerts[0]?.signature)).toMatch(/eicar/i);
  expect(JSON.stringify(alerts[0])).not.toMatch(/quarantine\/|clean\/|incoming\//);
});
