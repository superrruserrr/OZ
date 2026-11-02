import { Controller, Get, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Actor } from '@oz/auth';
import type { Request } from 'express';
import { getLoggerToken, type PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { undeclaredRoutes } from '../../test/rbac-fixtures.js';
import { AccessTokenGuard, actors } from '../auth/access-token.guard.js';
import { UNAUTHENTICATED } from '../auth/errors.js';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter.js';
import { actorOf, CurrentActor } from './actor.decorator.js';
import { DefaultDenyGuard } from './default-deny.guard.js';
import { Authenticated, Can, Public, Roles, Scope } from './decorators.js';
import { RolesGuard } from './roles.guard.js';

// Décorateurs et refus par défaut sur une vraie pile Nest ; seule la lecture du jeton est doublée.

const executed = vi.fn();

@Controller('demo')
class DemoController {
  @Get('oublie')
  forgotten(): string {
    executed();
    return 'exécuté';
  }

  @Public()
  @Get('public')
  open(): string {
    return 'ok';
  }

  @Authenticated()
  @Get('session')
  session(@CurrentActor() actor: Actor): string {
    return actor.userId;
  }

  @Roles('club', 'admin')
  @Get('club')
  club(): string {
    return 'ok';
  }

  @Roles()
  @Get('personne')
  nobody(): string {
    return 'ok';
  }

  @Roles('club', 'admin')
  @Scope('organizationId')
  @Get('org/:organizationId')
  scoped(): string {
    return 'ok';
  }

  @Can('kyc.decide')
  @Get('kyc')
  decide(): string {
    return 'ok';
  }

  @Can('player.create')
  @Scope('organizationId')
  @Get('creer/:organizationId')
  create(): string {
    return 'ok';
  }

  @Scope('organizationId')
  @Get('membre/:organizationId')
  member(): string {
    return 'ok';
  }

  @Roles('admin')
  @Scope('absent')
  @Get('faute/:organizationId')
  typo(): string {
    return 'ok';
  }
}

const silent = { info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
@Roles('admin')
@Controller('classe')
class RestrictedController {
  @Roles('admin', 'club')
  @Get()
  narrowed(): string {
    return 'ok';
  }
}

const warn = vi.fn();
const error = vi.fn();
const roles: Record<string, Actor['roles']> = {
  club: [{ role: 'club', organizationId: 'org-a' }],
  admin: [{ role: 'admin', organizationId: null }],
  player: [{ role: 'player', organizationId: null }],
  centerAClubB: [
    { role: 'center', organizationId: 'org-a' },
    { role: 'club', organizationId: 'org-b' },
  ],
  none: [],
};

/** Double de la garde d'accès : `Authorization` porte le nom du jeu de rôles. */
const accessGuard: CanActivate = {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const name = req.header('Authorization');
    if (name === undefined) throw UNAUTHENTICATED();
    actors.set(req, { userId: 'compte', roles: roles[name] ?? [], isKyc3Verified: false });
    return true;
  },
};

let app: NestExpressApplication;
let server: App;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [DemoController, RestrictedController],
    providers: [
      RolesGuard,
      { provide: APP_GUARD, useClass: DefaultDenyGuard },
      { provide: getLoggerToken(RolesGuard.name), useValue: { warn } },
      { provide: getLoggerToken(DefaultDenyGuard.name), useValue: { error } },
    ],
  })
    .overrideGuard(AccessTokenGuard)
    .useValue(accessGuard)
    .compile();
  app = module.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter(silent));
  await app.init();
  server = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.clearAllMocks();
});

const get = (path: string, as?: string) => {
  const call = request(server).get(path);
  return as === undefined ? call : call.set('Authorization', as);
};
const code = (response: { body: unknown }): unknown => (response.body as { code?: string }).code;

describe('refus par défaut', () => {
  it.each([[undefined], ['admin']])(
    'route sans politique : 403, sans exécution (%s)',
    async (as) => {
      const response = await get('/demo/oublie', as).expect(403);
      expect(code(response)).toBe('AUTHZ_FORBIDDEN');
      expect(executed).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
    },
  );

  it('route publique ouverte sans session', async () => {
    await get('/demo/public').expect(200);
  });

  it('@Authenticated : 401 sans session, ouverte à un compte sans rôle', async () => {
    await get('/demo/session').expect(401);
    await get('/demo/session', 'none').expect(200, 'compte');
  });

  it('une route non déclarée dans la matrice est détectée', () => {
    expect(
      undeclaredRoutes(app, [{ method: 'GET', path: '/demo/public', access: 'public' }]),
    ).toContain('GET /demo/oublie');
    expect(
      undeclaredRoutes(app, [{ method: 'GET', path: '/demo/public', access: 'public' }]),
    ).not.toContain('GET /demo/public');
  });
});

describe('@Roles, @Can, @Scope', () => {
  it('401 avant 403 : sans session, le rôle n’est pas évalué', async () => {
    await get('/demo/club').expect(401);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rôle cité : 200 ; autre rôle : 403 journalisé sans donnée personnelle', async () => {
    await get('/demo/club', 'club').expect(200);
    const response = await get('/demo/club', 'player').expect(403);
    expect(code(response)).toBe('AUTHZ_FORBIDDEN');
    expect(warn).toHaveBeenCalledWith(
      { method: 'GET', route: '/demo/club', userId: 'compte' },
      expect.any(String),
    );
  });

  it('jamais 200 filtré : compte sans rôle refusé', async () => {
    await get('/demo/club', 'none').expect(403);
  });

  it('@Roles() sans rôle : fermée à tous, administrateur compris', async () => {
    await get('/demo/personne', 'admin').expect(403);
  });

  it('@Scope : organisation du compte seulement, portée globale de l’administrateur', async () => {
    await get('/demo/org/org-a', 'club').expect(200);
    await get('/demo/org/org-b', 'club').expect(403);
    await get('/demo/org/org-b', 'admin').expect(200);
    await get('/demo/org/org-a', 'player').expect(403);
  });

  it('@Can suit la matrice', async () => {
    await get('/demo/kyc', 'admin').expect(200);
    await get('/demo/kyc', 'club').expect(403);
  });

  it('@Can avec @Scope : l’action doit être tenue dans cette organisation', async () => {
    await get('/demo/creer/org-a', 'club').expect(200);
    await get('/demo/creer/org-b', 'club').expect(403);
    await get('/demo/creer/org-a', 'centerAClubB').expect(403);
    await get('/demo/creer/org-b', 'centerAClubB').expect(200);
  });

  it('@Scope seul pose ses gardes : session exigée, organisation du compte', async () => {
    await get('/demo/membre/org-a').expect(401);
    await get('/demo/membre/org-a', 'club').expect(200);
    await get('/demo/membre/org-b', 'club').expect(403);
  });

  it('@Scope sur un paramètre inexistant : fermé à tous, administrateur compris', async () => {
    await get('/demo/faute/org-a', 'admin').expect(403);
  });

  it('une méthode restreint sa classe, elle ne l’élargit pas', async () => {
    await get('/classe', 'admin').expect(200);
    await get('/classe', 'club').expect(403);
  });

  it('journalise le motif de la route, pas ses valeurs', async () => {
    await get('/demo/org/org-b', 'club').expect(403);
    expect(warn).toHaveBeenCalledWith(
      { method: 'GET', route: '/demo/org/:organizationId', userId: 'compte' },
      expect.any(String),
    );
  });
});

describe('actorOf', () => {
  it('route protégée sans garde : erreur de programmation', () => {
    expect(() => actorOf({} as Request)).toThrow(/AccessTokenGuard/);
  });
});
