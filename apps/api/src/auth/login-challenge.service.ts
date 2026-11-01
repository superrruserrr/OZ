import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { generateOneTimeToken } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../database/database.module.js';
import {
  AUTH_CONFIG,
  LOGIN_CHALLENGE_MAX_ATTEMPTS,
  LOGIN_CHALLENGE_TTL_SECONDS,
} from './auth.tokens.js';

export interface LoginChallenge {
  readonly userId: string;
  /** Libellé de l'appareil qui a présenté le mot de passe. */
  readonly device: string;
  /** État du mot de passe à l'émission : un défi ne survit pas à une réinitialisation. */
  readonly credentialStamp: string;
}

/**
 * Compte un essai et rend le contenu du défi. Le dernier essai permis reste entier : un code juste y
 * consomme encore le défi. Au-delà, le défi disparaît. KEYS[1] : défi ; ARGV[1] : essais permis.
 */
const TAKE_ATTEMPT = `
local challenge = redis.call('HMGET', KEYS[1], 'user', 'device', 'stamp', 'attempts')
if not challenge[1] then return false end
if tonumber(challenge[4]) >= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return false
end
redis.call('HINCRBY', KEYS[1], 'attempts', 1)
return challenge
`;

/**
 * Défi de connexion (lot 1.3cb, D4) : preuve que le mot de passe était juste, sans session. Jeton
 * opaque de 256 bits, 5 minutes, 5 essais, usage unique à la réussite. Redis ne garde qu'une
 * empreinte du jeton et l'identifiant du compte : aucune adresse email.
 */
@Injectable()
export class LoginChallengeService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async issue(challenge: LoginChallenge): Promise<string> {
    const token = generateOneTimeToken();
    const key = this.keyFor(token);
    await this.redis
      .multi()
      .hset(key, {
        user: challenge.userId,
        device: challenge.device,
        stamp: challenge.credentialStamp,
        attempts: '0',
      })
      .expire(key, LOGIN_CHALLENGE_TTL_SECONDS)
      .exec();
    return token;
  }

  /** Défi du jeton, un essai en moins ; `null` s'il est inconnu, expiré ou épuisé. */
  async attempt(token: string): Promise<LoginChallenge | null> {
    const found = (await this.redis.eval(
      TAKE_ATTEMPT,
      1,
      this.keyFor(token),
      String(LOGIN_CHALLENGE_MAX_ATTEMPTS),
    )) as [string, string, string, string] | null;
    return found === null
      ? null
      : { userId: found[0], device: found[1], credentialStamp: found[2] };
  }

  /** Usage unique : vrai pour la seule requête qui consomme le défi. */
  async consume(token: string): Promise<boolean> {
    return (await this.redis.del(this.keyFor(token))) === 1;
  }

  private keyFor(token: string): string {
    const digest = createHmac('sha256', this.config.hmacKey)
      .update(`login-challenge:${token}`)
      .digest('hex');
    return `oz:auth:challenge:${digest}`;
  }
}
