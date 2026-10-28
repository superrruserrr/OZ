import { errors, jwtVerify, SignJWT } from 'jose';

/** Durée de vie du jeton d'accès : 15 minutes, fixe (EX-103 n° 3). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Taille minimale de la clé HS256, en octets : celle de Terraform (64 octets aléatoires). */
export const ACCESS_TOKEN_MIN_KEY_BYTES = 64;

const ALGORITHM = 'HS256';
const ISSUER = 'oz-api';
const AUDIENCE = 'oz';
/** Décalage d'horloge toléré entre instances, en secondes. */
const CLOCK_TOLERANCE_SECONDS = 30;
/** Un jeton plus long est refusé sans être décodé (borne le travail avant vérification). */
const MAX_TOKEN_LENGTH = 1024;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Identité portée par le jeton : ni rôle ni âge, recalculés à chaque requête (§6.7). */
export interface AccessTokenSubject {
  readonly userId: string;
  /** Famille de sessions (`sessions.family_id`) : sa révocation invalide le jeton (D2 du lot 1.3b). */
  readonly familyId: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresIn: number;
}

/**
 * Jetons d'accès HS256. La clé n'est jamais exposée ; l'algorithme est imposé à la vérification
 * (`alg: none` et confusion d'algorithmes refusés).
 */
export class AccessTokens {
  readonly #key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.byteLength < ACCESS_TOKEN_MIN_KEY_BYTES) {
      throw new RangeError(`clé de ${String(ACCESS_TOKEN_MIN_KEY_BYTES)} octets au moins`);
    }
    this.#key = Uint8Array.from(key);
  }

  async issue(subject: AccessTokenSubject, now: Date): Promise<IssuedAccessToken> {
    if (!UUID.test(subject.userId) || !UUID.test(subject.familyId)) {
      throw new TypeError('identifiants UUID attendus');
    }
    const issuedAt = Math.floor(now.getTime() / 1000);
    const token = await new SignJWT({ sid: subject.familyId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(subject.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .setJti(crypto.randomUUID())
      .sign(this.#key);
    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Sujet du jeton, ou `null` s'il est invalide, expiré, altéré ou signé autrement. */
  async verify(token: string, now: Date): Promise<AccessTokenSubject | null> {
    if (token.length > MAX_TOKEN_LENGTH || !COMPACT_JWS.test(token)) return null;
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: now,
        // 15 minutes imposées à la vérification aussi : un `exp` lointain, même bien signé, est refusé.
        // Avec cette option, jose refuse aussi un `iat` futur (clé ou horloge fautive).
        maxTokenAge: ACCESS_TOKEN_TTL_SECONDS,
        requiredClaims: ['sub', 'sid', 'iat', 'exp', 'jti'],
        typ: 'JWT',
      });
      const { sub, sid } = payload;
      if (typeof sub !== 'string' || typeof sid !== 'string') return null;
      if (!UUID.test(sub) || !UUID.test(sid)) return null;
      return { userId: sub, familyId: sid };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
