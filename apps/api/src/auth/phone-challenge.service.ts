import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { otpDigest } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../database/database.module.js';
import {
  AUTH_CONFIG,
  PHONE_CHALLENGE_MAX_ATTEMPTS,
  PHONE_CHALLENGE_TTL_SECONDS,
  PHONE_RESEND_SECONDS,
} from './auth.tokens.js';

/**
 * Compte un essai et, si l'empreinte est juste, consomme le défi et rend le numéro scellé : atomique,
 * donc jamais un défi remplacé entre-temps. Le dernier essai permis reste entier. Au-delà, le défi
 * disparaît. KEYS[1] : défi ; ARGV : essais permis, empreinte présentée.
 */
const TAKE_ATTEMPT = `
local challenge = redis.call('HMGET', KEYS[1], 'digest', 'phone', 'attempts')
if not challenge[1] then return false end
if tonumber(challenge[3]) >= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return false
end
if challenge[1] == ARGV[2] then
  redis.call('DEL', KEYS[1])
  return challenge[2]
end
redis.call('HINCRBY', KEYS[1], 'attempts', 1)
return false
`;

/** Remplace le défi en une fois. KEYS[1] : défi ; ARGV : empreinte, numéro scellé, durée. */
const ISSUE = `
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'phone', ARGV[2], 'attempts', '0')
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Code de vérification du téléphone (lot 1.3cc, D4) : 5 minutes, 5 essais, usage unique, un seul code
 * vivant par compte. Le numéro n'existe en base qu'une fois prouvé (D5) : d'ici là, il attend dans
 * Redis, scellé en AES-256-GCM. Clés, code et compte n'y paraissent qu'en empreinte.
 */
@Injectable()
export class PhoneChallengeService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Remplace tout code précédent. */
  async issue(userId: string, phone: string, code: string): Promise<void> {
    await this.redis.eval(
      ISSUE,
      1,
      this.keyFor('phone', userId),
      otpDigest(this.config.hmacKey, userId, code),
      this.seal(userId, phone),
      String(PHONE_CHALLENGE_TTL_SECONDS),
    );
  }

  /** Numéro prouvé par le code, pour la seule requête qui consomme le défi ; sinon `null`. */
  async verify(userId: string, code: string): Promise<string | null> {
    const sealed = (await this.redis.eval(
      TAKE_ATTEMPT,
      1,
      this.keyFor('phone', userId),
      String(PHONE_CHALLENGE_MAX_ATTEMPTS),
      otpDigest(this.config.hmacKey, userId, code),
    )) as string | null;
    return sealed === null ? null : this.unseal(userId, sealed);
  }

  /** Secondes à attendre avant un renvoi ; 0 si la voie est libre. */
  async cooldownSeconds(userId: string): Promise<number> {
    return Math.max(0, await this.redis.ttl(this.keyFor('phone-cooldown', userId)));
  }

  /** Vrai pour la seule requête qui ouvre la période de 60 s. */
  async startCooldown(userId: string): Promise<boolean> {
    const key = this.keyFor('phone-cooldown', userId);
    return (await this.redis.set(key, '1', 'EX', PHONE_RESEND_SECONDS, 'NX')) === 'OK';
  }

  private keyFor(scope: string, userId: string): string {
    const digest = createHmac('sha256', this.config.hmacKey)
      .update(`${scope}:${userId}`)
      .digest('hex');
    return `oz:auth:${scope}:${digest}`;
  }

  private sealKey(): Buffer {
    return createHmac('sha256', this.config.hmacKey).update('phone-seal').digest();
  }

  /** Lié au compte : un numéro scellé ne se rejoue pas sur un autre compte. */
  private seal(userId: string, phone: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.sealKey(), iv).setAAD(Buffer.from(userId));
    const sealed = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64');
  }

  private unseal(userId: string, value: string): string | null {
    const raw = Buffer.from(value, 'base64');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.sealKey(), raw.subarray(0, IV_BYTES), {
        authTagLength: TAG_BYTES,
      }).setAAD(Buffer.from(userId));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const opened = Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
      return opened.toString('utf8');
    } catch {
      return null;
    }
  }
}
