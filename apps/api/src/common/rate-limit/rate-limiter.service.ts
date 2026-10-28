import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  resolveRateLimits,
  SLIDING_LOG_SCRIPT,
  type RateLimitDecision,
  type RateLimitRule,
  type RateLimits,
} from '@oz/auth';
import type { Redis } from 'ioredis';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../database/database.module.js';

/** Clé HMAC des compteurs : ni IP ni email en clair dans Redis. */
export const RATE_LIMIT_KEY = Symbol('RATE_LIMIT_KEY');
/** Lecture du réglage `rate_limits` (`system_settings`, D2). */
export const RATE_LIMIT_SETTINGS = Symbol('RATE_LIMIT_SETTINGS');
/** Durée du cache du réglage, en millisecondes. */
export const RATE_LIMIT_CACHE_MS = Symbol('RATE_LIMIT_CACHE_MS');

/** Nom de l'erreur seulement : son message peut citer la base ou la requête. */
const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

/**
 * Limitation de débit (lot 1.3ca, D1 à D3) : journal glissant exact, atomique dans Redis
 * (`SLIDING_LOG_SCRIPT`), partagé par toutes les instances. Redis indisponible : l'erreur remonte,
 * aucun passage n'est accordé (D3). Réglage absent, invalide ou illisible : valeurs par défaut.
 */
@Injectable()
export class RateLimiter {
  private cached: { readonly limits: RateLimits; readonly until: number } | null = null;
  private loading: Promise<RateLimits> | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(RATE_LIMIT_KEY) private readonly key: string | Uint8Array,
    @Inject(RATE_LIMIT_SETTINGS) private readonly readSettings: () => Promise<unknown>,
    @InjectPinoLogger(RateLimiter.name) private readonly logger: Pick<PinoLogger, 'warn'>,
    @Inject(RATE_LIMIT_CACHE_MS) private readonly cacheMs: number,
  ) {}

  /** Compte un passage de `subject` (IP, compte, email) pour `rule` ; refuse au-delà de la limite. */
  async consume(rule: RateLimitRule, subject: string): Promise<RateLimitDecision> {
    const { limit, windowSeconds } = (await this.limits())[rule];
    const wait = Number(
      await this.redis.eval(
        SLIDING_LOG_SCRIPT,
        1,
        this.keyFor(rule, subject),
        String(limit),
        String(windowSeconds * 1000),
        randomUUID(),
      ),
    );
    // Réponse inattendue : erreur plutôt qu'un passage accordé par défaut (D3).
    if (!Number.isInteger(wait) || wait < 0)
      throw new Error('Limiteur : réponse Redis inattendue.');
    return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true };
  }

  private keyFor(rule: RateLimitRule, subject: string): string {
    const digest = createHmac('sha256', this.key)
      .update(`rate-limit:${rule}:${subject}`)
      .digest('hex');
    return `oz:rl:${rule}:${digest}`;
  }

  private async limits(): Promise<RateLimits> {
    if (this.cached !== null && Date.now() < this.cached.until) return this.cached.limits;
    // Une seule lecture à la fois : les requêtes arrivées pendant le rechargement l'attendent.
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<RateLimits> {
    let setting: unknown = null;
    try {
      setting = await this.readSettings();
    } catch (error) {
      this.logger.warn(
        { event: 'rate_limit.settings_unavailable', error: errorName(error) },
        'Réglage des limites illisible : valeurs par défaut.',
      );
    }
    const { limits, valid } = resolveRateLimits(setting);
    if (!valid) {
      this.logger.warn(
        { event: 'rate_limit.settings_invalid' },
        'Réglage des limites invalide : valeurs par défaut.',
      );
    }
    this.cached = { limits, until: Date.now() + this.cacheMs };
    return limits;
  }
}
