import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  BACKOFF_FREE_FAILURES,
  backoffSeconds,
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import { credentialsFor, rehashPassword, withUserContext, type PrismaClient } from '@oz/db';
import type { Redis } from 'ioredis';
import { AUTH_CONFIG } from './auth.tokens.js';
import { DB_CLIENT, REDIS_CLIENT } from '../database/database.module.js';

export type CredentialsResult =
  | { readonly result: 'ok'; readonly userId: string }
  | { readonly result: 'invalid' }
  | { readonly result: 'email_unverified' }
  | { readonly result: 'retry_later'; readonly retryAfterSeconds: number };

/** Les échecs s'oublient après 24 h sans nouvelle tentative. */
const FAILURE_WINDOW_SECONDS = 24 * 3_600;
const LOGIN_STATUSES = new Set(['pending_verification', 'active']);
/** Délai après n échecs, n = 0 à BACKOFF_FREE_FAILURES + 10 (plafond atteint au-delà). */
const BACKOFF_TABLE = Array.from({ length: BACKOFF_FREE_FAILURES + 11 }, (_, n) =>
  String(backoffSeconds(n)),
);

/**
 * Réserve une tentative, atomiquement : pendant le délai, renvoie l'attente en secondes ; sinon
 * compte la tentative comme un échec (un succès efface ensuite le compteur) et renvoie 0. Des
 * requêtes parallèles ne peuvent donc pas évaluer plus de mots de passe que le délai n'en permet.
 * ARGV : maintenant (ms), fenêtre d'oubli (s), puis le délai après 0, 1, 2… échecs.
 */
const RESERVE_ATTEMPT = `
local state = redis.call('HMGET', KEYS[1], 'failures', 'last')
local failures = math.max(0, math.floor(tonumber(state[1]) or 0))
local last = tonumber(state[2]) or 0
local now = tonumber(ARGV[1])
local delay = tonumber(ARGV[3 + math.min(failures, #ARGV - 3)])
local wait = math.ceil(last / 1000 + delay - now / 1000)
if failures > 0 and wait > 0 then return wait end
redis.call('HSET', KEYS[1], 'failures', failures + 1, 'last', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 0
`;

/**
 * Vérification des identifiants (lot 1.3a), utilisée par `POST /auth/login` au lot 1.3b.
 * - Même résultat « invalid » et même travail (Argon2 sur un hash factice) que le compte existe ou
 *   non, soit suspendu, clos ou supprimé (EX-103 n° 10, CP-28).
 * - Délai exponentiel par compte dès 3 échecs, plafonné à 15 min, jamais de verrouillage
 *   (EX-103 n° 8) ; pendant le délai, le mot de passe n'est pas évalué. La tentative est réservée
 *   atomiquement (script Redis) avant l'évaluation. Les compteurs Redis sont
 *   indexés par une empreinte HMAC de l'email : aucune adresse en clair.
 * - Email non vérifié signalé seulement après un mot de passe juste (EX-103 n° 9).
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async verify(email: string, password: string, now = Date.now()): Promise<CredentialsResult> {
    const key = this.failureKey(email);
    const wait = await this.reserve(key, now);
    if (wait > 0) return { result: 'retry_later', retryAfterSeconds: wait };

    const account = await credentialsFor(this.db, email);
    const storedHash = account?.passwordHash ?? (await dummyPasswordHash());
    const matches = await verifyPassword(storedHash, password);
    if (
      account === null ||
      account.passwordHash === null ||
      !matches ||
      !LOGIN_STATUSES.has(account.status)
    ) {
      return { result: 'invalid' };
    }
    await this.redis.del(key);
    if (needsRehash(account.passwordHash))
      await this.upgradeHash(account.userId, account.passwordHash, password);
    if (!account.emailVerified) return { result: 'email_unverified' };
    return { result: 'ok', userId: account.userId };
  }

  /**
   * Réserve un essai de second facteur (D8 du lot 1.3cb) : même délai exponentiel que le mot de
   * passe, sur un compteur à part qu'un mot de passe juste n'efface pas. Renvoie l'attente, ou 0.
   */
  async reserveSecondFactor(userId: string, now = Date.now()): Promise<number> {
    return this.reserve(this.secondFactorKey(userId), now);
  }

  async clearSecondFactor(userId: string): Promise<void> {
    await this.redis.del(this.secondFactorKey(userId));
  }

  private async reserve(key: string, now: number): Promise<number> {
    return Number(
      await this.redis.eval(
        RESERVE_ATTEMPT,
        1,
        key,
        String(now),
        String(FAILURE_WINDOW_SECONDS),
        ...BACKOFF_TABLE,
      ),
    );
  }

  private secondFactorKey(userId: string): string {
    const digest = createHmac('sha256', this.config.hmacKey).update(`totp:${userId}`).digest('hex');
    return `oz:auth:failures:${digest}`;
  }

  private failureKey(email: string): string {
    const digest = createHmac('sha256', this.config.hmacKey)
      .update(email.trim().toLowerCase())
      .digest('hex');
    return `oz:auth:failures:${digest}`;
  }

  /**
   * Mise à niveau du hash (paramètres changés), sous le contexte du titulaire dont le mot de passe
   * vient d'être vérifié. Conditionnelle à l'ancien hash : un changement concurrent l'emporte.
   */
  private async upgradeHash(userId: string, oldHash: string, password: string): Promise<void> {
    const newHash = await hashPassword(password);
    await withUserContext(this.db, userId, (tx) =>
      rehashPassword(tx, { userId, oldHash, newHash }),
    );
  }
}
