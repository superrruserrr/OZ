import { RBAC_ROLES, type RbacRole } from '@oz/auth';
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

// Journal d'audit (lot 1.16a, EX-118 n° 1, EX-T11, CP-23) sur la pile réelle : seul l'administrateur
// vérifié consulte le journal, page par page de la plus récente à la plus ancienne, et l'état de la
// dernière vérification de la chaîne.

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const ORGANIZATION_ROLES: readonly RbacRole[] = [
  'academy',
  'club',
  'federation',
  'center',
  'recruiter',
];

let harness: AuthHarness;
let server: App;
let organizationId: string;
let counter = 0;

interface Account {
  readonly userId: string;
  readonly token: string;
}

async function account(role?: RbacRole): Promise<Account> {
  const address = `audit-${String(++counter)}@example.test`;
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
  const login = await request(server)
    .post('/auth/login')
    .send({ email: address, password: PASSWORD })
    .expect(200);
  if (role !== undefined) {
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`,
      [userId, role, ORGANIZATION_ROLES.includes(role) ? organizationId : null],
    );
    // Rôles à 2FA obligatoire : posée ici, le parcours d'enrôlement a sa propre suite.
    await harness.db.query(
      `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
      [userId],
    );
  }
  return { userId, token: (login.body as { accessToken: string }).accessToken };
}

const get = (path: string, token?: string) => {
  const pending = request(server).get(path).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

const errorCode = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

interface Entry {
  readonly id: string;
  readonly position: number;
  readonly action: string;
  readonly targetId: string | null;
  readonly metadata: string;
  readonly hash: string;
}
interface Page {
  readonly entries: Entry[];
  readonly nextCursor: string | null;
}

/** Entrées synthétiques, écrites comme le ferait l'application (chaîne posée par la base). */
async function record(count: number, action = 'kyc.case.transitioned'): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(`SELECT oz_uuid_v7()::text AS id`);
  const target = rows[0]?.id ?? '';
  for (let i = 0; i < count; i += 1) {
    await harness.db.query(
      `INSERT INTO audit_log (action, target_type, target_id, reason, metadata)
       VALUES ($1, 'kyc_case', $2, 'motif synthétique', jsonb_build_object('step', $3::int))`,
      [action, target, i],
    );
  }
  return target;
}

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
       VALUES ('club', 'Club de test', 'CM', 'verified') RETURNING id`,
  );
  organizationId = rows[0]?.id ?? '';
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /admin/audit-log', () => {
  it('administrateur : de la plus récente à la plus ancienne, pages jointives, sans cache', async () => {
    const admin = await account('admin');
    const target = await record(5);
    const pages: Entry[][] = [];
    let cursor: string | null = null;
    do {
      const response = await get(
        `/admin/audit-log?targetId=${target}&limit=2${cursor === null ? '' : `&cursor=${cursor}`}`,
        admin.token,
      ).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const page = response.body as Page;
      pages.push(page.entries);
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    const entries = pages.flat();
    const positions = entries.map((e) => e.position);
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
    expect(entries.map((e) => JSON.parse(e.metadata) as unknown)).toEqual(
      [4, 3, 2, 1, 0].map((step) => ({ step })),
    );
    expect(entries.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
  });

  it('filtres par action et période appliqués en base', async () => {
    const admin = await account('admin');
    await record(2, 'kyc.case.opened');
    const opened = (await get('/admin/audit-log?action=kyc.case.opened', admin.token).expect(200))
      .body as Page;
    expect(opened.entries.length).toBeGreaterThanOrEqual(2);
    expect(opened.entries.every((e) => e.action === 'kyc.case.opened')).toBe(true);
    const future = (
      await get('/admin/audit-log?from=2100-01-01T00:00:00Z', admin.token).expect(200)
    ).body as Page;
    expect(future).toEqual({ entries: [], nextCursor: null });
  });

  it('curseur forgé, filtre inconnu ou période inversée : 422', async () => {
    const admin = await account('admin');
    for (const query of [
      'cursor=cDow',
      'cursor=%2B%2B',
      'limit=101',
      'unknown=1',
      'targetId=pas-un-uuid',
      'from=2026-11-04T00:00:00Z&to=2026-11-03T00:00:00Z',
      'action=a&action=b',
    ]) {
      const response = await get(`/admin/audit-log?${query}`, admin.token);
      expect(response.status, query).toBe(422);
      expect(errorCode(response)).toBe('VALIDATION_FAILED');
    }
  });

  it('les sept autres rôles et un compte sans rôle : 403 ; sans session : 401', async () => {
    await get('/admin/audit-log').expect(401);
    for (const role of [...RBAC_ROLES.filter((r) => r !== 'admin'), undefined]) {
      const { token } = await account(role);
      for (const path of ['/admin/audit-log', '/admin/audit-log/integrity']) {
        const response = await get(path, token);
        expect(response.status, `${String(role)} ${path}`).toBe(403);
        expect(errorCode(response)).toBe('AUTHZ_FORBIDDEN');
      }
    }
  });

  it('limite par compte : 429 avec Retry-After', async () => {
    const admin = await account('admin');
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      audit_log_read_account: { limit: 1, windowSeconds: 3600 },
    });
    await get('/admin/audit-log', admin.token).expect(200);
    const refused = await get('/admin/audit-log/integrity', admin.token).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('journal applicatif : noms de filtres, jamais leurs valeurs', async () => {
    const admin = await account('admin');
    const target = await record(1);
    await get(`/admin/audit-log?targetId=${target}`, admin.token).expect(200);
    const reads = harness.logs.lines().filter((l) => l.event === 'audit.log.read');
    expect(reads.at(-1)).toMatchObject({ filters: ['targetId'], count: 1 });
    expect(harness.logs.raw()).not.toContain(target);
  });
});

describe('GET /admin/audit-log/integrity', () => {
  it('jamais vérifiée : `lastCheck` nul ; puis dernière vérification de la base', async () => {
    const admin = await account('admin');
    const before = await get('/admin/audit-log/integrity', admin.token).expect(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(before.body).toEqual({ lastCheck: null });
    // Vérification du worker, rejouée ici sous le propriétaire, hors contexte utilisateur.
    await harness.db.query(`SELECT oz_audit_check(NULL, NULL)`);
    const after = (await get('/admin/audit-log/integrity', admin.token).expect(200)).body as {
      lastCheck: { isIntact: boolean; anchorPosition: number | null; headPosition: number };
    };
    expect(after.lastCheck).toMatchObject({
      isIntact: true,
      defectPosition: null,
      anchorPosition: null,
    });
    expect(after.lastCheck.headPosition).toBeGreaterThan(0);
  });
});
