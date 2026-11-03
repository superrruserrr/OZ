import { readFileSync } from 'node:fs';
import { Controller, Get, Module, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  parseRbacMatrix,
  RBAC_ROLES,
  type AccessTokens,
  type Actor,
  type RbacRole,
} from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenGuard, actors } from '../src/auth/access-token.guard.js';
import { ACCESS_TOKENS } from '../src/auth/auth.tokens.js';
import { Roles, Scope } from '../src/authorization/decorators.js';
import type { ApiError } from '../src/common/errors/api-error.js';
import { DatabaseModule, DB_CLIENT } from '../src/database/database.module.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';
import { mountedRoutes, undeclaredRoutes } from './rbac-fixtures.js';

// Suite générée (EX-104 n° 6, n° 7, CP-08, CP-09) : chaque route montée figure dans
// `docs/security/rbac.md` et chaque couple (route, rôle) est appelé en HTTP.

const matrix = parseRbacMatrix(
  readFileSync(new URL('../../../docs/security/rbac.md', import.meta.url), 'utf8'),
);

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const REFUSALS = ['AUTHZ_FORBIDDEN', 'AUTH_2FA_ENROLLMENT_REQUIRED', 'AUTH_EMAIL_UNVERIFIED'];

const GLOBAL_ROLES: readonly RbacRole[] = ['player', 'guardian', 'admin'];

/** Route à rôle sur la pile réelle : aucune route métier n'en porte encore (EX-104 n° 6, CP-09). */
@Controller('sonde')
class ProbeController {
  @Roles('club', 'admin')
  @Get()
  restricted(): string {
    return 'ok';
  }

  @Roles('club')
  @Scope('organizationId')
  @Get(':organizationId')
  scoped(): string {
    return 'ok';
  }
}

@Module({ imports: [DatabaseModule], controllers: [ProbeController] })
class ProbeModule {}

const isProbe = (route: string): boolean => route.startsWith('GET /sonde');

let harness: AuthHarness;
let server: App;
let organizationId: string;
let counter = 0;

async function account(): Promise<{ address: string; userId: string }> {
  const address = `rbac-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  const { rows } = await harness.db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    address,
  ]);
  return { address, userId: rows[0]?.id ?? '' };
}

const login = async (address: string): Promise<string> =>
  (
    (
      await request(server)
        .post('/auth/login')
        .send({ email: address, password: PASSWORD })
        .expect(200)
    ).body as { accessToken: string }
  ).accessToken;

async function grant(userId: string, role: RbacRole, organization: string | null): Promise<void> {
  await harness.db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`,
    [userId, role, organization],
  );
  // Rôles à 2FA obligatoire : posée ici, le parcours d'enrôlement a sa propre suite.
  await harness.db.query(
    `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
    [userId],
  );
}

// Paramètre de route (`:id`, `:ozId`) : un enregistrement absent, bien formé.
const PLACEHOLDERS: Record<string, string> = {
  ':id': '00000000-0000-4000-8000-000000000001',
  ':ozId': 'OZ-CM-26-000000-0',
};

const call = (method: string, path: string, token?: string) => {
  const url = path.replace(/:\w+/g, (param) => PLACEHOLDERS[param] ?? param);
  const verb = method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
  const pending = request(server)[verb](url).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

/** Routes sans paramètre dont le 404 dit « aucune ressource » (lot 1.16bb : aucune archive prête). */
const MOUNTED_NOT_FOUND: Readonly<Record<string, string>> = {
  'GET /account/data-export/download': 'DATA_EXPORT_NOT_FOUND',
};

const errorCode = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

beforeAll(async () => {
  harness = await startAuthHarness({ FEATURE_CONTACT_FORM: 'true', FEATURE_DOCUMENTS: 'true' }, [
    ProbeModule,
  ]);
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
  server = harness.app.getHttpServer();
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
       VALUES ('club', 'Club de test', 'CM', 'verified') RETURNING id`,
  );
  organizationId = rows[0]?.id ?? '';
});
afterAll(async () => {
  await harness.stop();
});

describe('matrice routes', () => {
  it('toute route montée est déclarée, et inversement', () => {
    expect(undeclaredRoutes(harness.app, matrix.routes).filter((r) => !isProbe(r))).toEqual([]);
    const mounted = new Set(mountedRoutes(harness.app));
    expect(matrix.routes.filter(({ method, path }) => !mounted.has(`${method} ${path}`))).toEqual(
      [],
    );
  });

  describe.each(matrix.routes)('$method $path ($access)', ({ method, path, access }) => {
    // Un paramètre désigne un enregistrement absent : 404 attendu, jamais un autre motif de route
    // absente. Seul un 404 à code métier déclaré ici prouve un traitement monté sans paramètre.
    const isMounted = (response: { status: number; body: unknown }): boolean =>
      response.status !== 404 ||
      path.includes(':') ||
      MOUNTED_NOT_FOUND[`${method} ${path}`] === errorCode(response);

    it('sans session', async () => {
      const response = await call(method, path);
      expect(errorCode(response)).not.toBe('AUTHZ_FORBIDDEN');
      expect(response.status).toBeLessThan(500);
      if (access !== 'public') expect(response.status).toBe(401);
      else expect(isMounted(response)).toBe(true);
    });

    it.each(RBAC_ROLES)('rôle %s', async (role) => {
      const { address, userId } = await account();
      const token = await login(address);
      await grant(userId, role, GLOBAL_ROLES.includes(role) ? null : organizationId);
      const response = await call(method, path, token);
      // Route à action (`@Can`) : la cellule `deny` du rôle refuse, et `kyc3*` sans KYC 3 (aucun
      // compte de cette suite ne l'a) ; toute autre laisse passer.
      const cell =
        access === 'public' || access === 'authenticated' ? null : matrix.actions[access][role];
      if (cell === 'deny' || cell?.startsWith('kyc3') === true) {
        expect(response.status).toBe(403);
        expect(errorCode(response)).toBe('AUTHZ_FORBIDDEN');
        return;
      }
      expect(REFUSALS).not.toContain(errorCode(response));
      expect(response.status).toBeLessThan(500);
      expect(isMounted(response)).toBe(true);
      if (access !== 'public') expect(response.status).not.toBe(401);
    });
  });
});

describe('pile réelle : AccessTokenGuard puis RolesGuard (CP-09)', () => {
  const probe = (path: string, token?: string) => call('GET', path, token);

  it('401 sans session, 403 au rôle non autorisé, 200 au rôle autorisé', async () => {
    await probe('/sonde').expect(401);
    const { address, userId } = await account();
    const token = await login(address);
    const refused = await probe('/sonde', token).expect(403);
    expect(errorCode(refused)).toBe('AUTHZ_FORBIDDEN');
    await grant(userId, 'recruiter', organizationId);
    await probe('/sonde', token).expect(403);
    await grant(userId, 'club', organizationId);
    await probe('/sonde', token).expect(200, 'ok');
  });

  it('2FA obligatoire non enrôlée : le refus 2FA passe avant le rôle', async () => {
    const { address, userId } = await account();
    const token = await login(address);
    await harness.db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [userId]);
    const refused = await probe('/sonde', token).expect(403);
    expect(errorCode(refused)).toBe('AUTH_2FA_ENROLLMENT_REQUIRED');
  });

  it('@Scope : l’organisation du compte seulement', async () => {
    const { address, userId } = await account();
    const token = await login(address);
    await grant(userId, 'club', organizationId);
    await probe(`/sonde/${organizationId}`, token).expect(200);
    await probe('/sonde/00000000-0000-4000-8000-000000000002', token).expect(403);
  });

  it('jeton altéré pour y loger un rôle : 401', async () => {
    const { address } = await account();
    const [head = '', payload = '', signature = ''] = (await login(address)).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as object;
    const forged = Buffer.from(JSON.stringify({ ...claims, roles: ['admin'] })).toString(
      'base64url',
    );
    await probe('/sonde', `${head}.${forged}.${signature}`).expect(401);
  });
});

describe('source des droits (CP-07, CP-08)', () => {
  function context(req: object): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => context,
      getClass: () => context,
    } as unknown as ExecutionContext;
  }

  async function actorFor(token: string, headers: Record<string, string> = {}): Promise<Actor> {
    const guard = new AccessTokenGuard(
      harness.app.get<PrismaClient>(DB_CLIENT, { strict: false }),
      harness.app.get<AccessTokens>(ACCESS_TOKENS, { strict: false }),
      new Reflector(),
    );
    const all: Record<string, string> = { Authorization: `Bearer ${token}`, ...headers };
    const req = { header: (name: string) => all[name], body: { role: 'admin' } };
    await guard.canActivate(context(req));
    return actors.get(req) as Actor;
  }

  it('un rôle ajouté ou retiré vaut dès la requête suivante, sans nouveau jeton', async () => {
    const { address, userId } = await account();
    const token = await login(address);
    expect((await actorFor(token)).roles).toEqual([]);
    await grant(userId, 'club', organizationId);
    expect((await actorFor(token)).roles).toEqual([{ role: 'club', organizationId }]);
    await harness.db.query(`UPDATE user_roles SET deleted_at = now() WHERE user_id = $1`, [userId]);
    expect((await actorFor(token)).roles).toEqual([]);
  });

  it('en-têtes et corps ne donnent aucun rôle, aucun niveau KYC', async () => {
    const { address } = await account();
    const actor = await actorFor(await login(address), {
      'X-Role': 'admin',
      'X-Kyc-Level': '3',
    });
    expect(actor.roles).toEqual([]);
    expect(actor.isKyc3Verified).toBe(false);
  });

  it('organisation non vérifiée ou supprimée : le rôle ne vaut plus', async () => {
    const { address, userId } = await account();
    const { rows } = await harness.db.query<{ id: string }>(
      `INSERT INTO organizations (type, name, country, verification_status)
       VALUES ('club', 'Autre', 'CM', 'verified') RETURNING id`,
    );
    const organization = rows[0]?.id ?? '';
    const token = await login(address);
    await grant(userId, 'club', organization);
    expect((await actorFor(token)).roles).toEqual([{ role: 'club', organizationId: organization }]);
    for (const status of ['declared', 'pending', 'in_review', 'rejected', 'suspended']) {
      await harness.db.query(`UPDATE organizations SET verification_status = $1 WHERE id = $2`, [
        status,
        organization,
      ]);
      expect((await actorFor(token)).roles).toEqual([]);
    }
    await harness.db.query(
      `UPDATE organizations SET verification_status = 'verified', deleted_at = now() WHERE id = $1`,
      [organization],
    );
    expect((await actorFor(token)).roles).toEqual([]);
  });
});
