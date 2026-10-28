import { isIP } from 'node:net';
import type { AuthSqlClient } from './auth.js';
import type { TransactionClient } from './session-context.js';

// Sessions (lot 1.3b, EX-103 n° 3 à 6) : appels typés aux fonctions de la migration
// 20261030100000_auth_sessions (chemin privilégié D-059 : connexion, rotation, déconnexion par cookie),
// et requêtes sous contexte utilisateur (RLS `sessions_self_read`, `sessions_self_revoke`) pour la liste et la révocation.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/;
const DAY = 86_400;
/** Libellé d'appareil (« Firefox · macOS »), jamais l'en-tête User-Agent brut. */
const DEVICE_MAX_LENGTH = 100;

function assertTokenHash(tokenHash: string): void {
  if (!TOKEN_HASH.test(tokenHash)) {
    throw new Error('Session : empreinte hexadécimale de 64 caractères attendue.');
  }
}

function assertUuid(id: string): void {
  if (!UUID.test(id)) throw new Error('Session : identifiant UUID attendu.');
}

// Mêmes bornes que oz_auth_check_session_ttl.
function assertTtls(ttlSeconds: number, familyTtlSeconds: number): void {
  const whole = Number.isInteger(ttlSeconds) && Number.isInteger(familyTtlSeconds);
  if (
    !whole ||
    ttlSeconds < DAY ||
    ttlSeconds > 30 * DAY ||
    familyTtlSeconds < ttlSeconds ||
    familyTtlSeconds > 90 * DAY
  ) {
    throw new Error('Session : durées entières, de 1 à 30 jours (famille : jusqu’à 90 jours).');
  }
}

function assertIp(ip: string | null): void {
  if (ip !== null && isIP(ip) === 0) throw new Error('Session : adresse IP attendue.');
}

function assertDevice(device: string | null): void {
  if (device !== null && (device.length === 0 || device.length > DEVICE_MAX_LENGTH)) {
    throw new Error(`Session : libellé d'appareil de 1 à ${String(DEVICE_MAX_LENGTH)} caractères.`);
  }
}

export interface OpenedSession {
  readonly sessionId: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  /** Ce libellé d'appareil a déjà ouvert une session du compte depuis 90 jours. */
  readonly knownDevice: boolean;
}

/** Ouvre une famille neuve ; NULL si le compte ne peut pas se connecter (inactif, non vérifié). */
export async function openSession(
  db: AuthSqlClient,
  input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly device: string | null;
    readonly ip: string | null;
    readonly ttlSeconds: number;
    readonly familyTtlSeconds: number;
  },
): Promise<OpenedSession | null> {
  assertUuid(input.userId);
  assertTokenHash(input.tokenHash);
  assertDevice(input.device);
  assertIp(input.ip);
  assertTtls(input.ttlSeconds, input.familyTtlSeconds);
  const rows = await db.$queryRaw<
    { session_id: string; family_id: string; expires_at: Date; known_device: boolean }[]
  >`
    SELECT session_id::text, family_id::text, expires_at, known_device
    FROM oz_auth_open_session(${input.userId}::uuid, ${input.tokenHash}, ${input.device},
      ${input.ip}::inet, make_interval(secs => ${input.ttlSeconds}),
      make_interval(secs => ${input.familyTtlSeconds}))`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    sessionId: row.session_id,
    familyId: row.family_id,
    expiresAt: row.expires_at,
    knownDevice: row.known_device,
  };
}

export type RotationResult =
  | {
      readonly outcome: 'rotated';
      readonly userId: string;
      readonly familyId: string;
      readonly sessionId: string;
      readonly expiresAt: Date;
    }
  | { readonly outcome: 'reuse'; readonly userId: string; readonly familyId: string }
  | { readonly outcome: 'invalid' };

/**
 * Consomme le jeton présenté et le remplace dans la même famille. Un jeton déjà consommé révoque
 * toute la famille (`reuse`) ; un jeton inconnu, expiré ou révoqué donne `invalid`.
 */
export async function rotateSession(
  db: AuthSqlClient,
  input: {
    readonly tokenHash: string;
    readonly newTokenHash: string;
    readonly ip: string | null;
    readonly ttlSeconds: number;
  },
): Promise<RotationResult> {
  assertTokenHash(input.tokenHash);
  assertTokenHash(input.newTokenHash);
  assertIp(input.ip);
  assertTtls(input.ttlSeconds, input.ttlSeconds);
  const rows = await db.$queryRaw<
    {
      outcome: 'rotated' | 'reuse' | 'invalid';
      user_id: string | null;
      family_id: string | null;
      session_id: string | null;
      expires_at: Date | null;
    }[]
  >`
    SELECT outcome, user_id::text, family_id::text, session_id::text, expires_at
    FROM oz_auth_rotate_session(${input.tokenHash}, ${input.newTokenHash}, ${input.ip}::inet,
      make_interval(secs => ${input.ttlSeconds}))`;
  const row = rows[0];
  if (
    row?.outcome === 'rotated' &&
    row.user_id &&
    row.family_id &&
    row.session_id &&
    row.expires_at
  ) {
    return {
      outcome: 'rotated',
      userId: row.user_id,
      familyId: row.family_id,
      sessionId: row.session_id,
      expiresAt: row.expires_at,
    };
  }
  if (row?.outcome === 'reuse' && row.user_id && row.family_id) {
    return { outcome: 'reuse', userId: row.user_id, familyId: row.family_id };
  }
  return { outcome: 'invalid' };
}

/** Déconnecte l'appareil du jeton présenté (toute sa famille) ; renvoie le titulaire, ou NULL. */
export async function logoutSession(db: AuthSqlClient, tokenHash: string): Promise<string | null> {
  assertTokenHash(tokenHash);
  const rows = await db.$queryRaw<{ id: string | null }[]>`
    SELECT oz_auth_logout(${tokenHash})::text AS id`;
  return rows[0]?.id ?? null;
}

// --- Sous contexte utilisateur (`withUserContext`) : la RLS ne laisse voir que ses sessions. ---

export interface SessionSummary {
  /** Famille : identifiant stable de la session, que les rotations ne changent pas (révocation). */
  readonly familyId: string;
  readonly device: string | null;
  /** IP tronquée (/24, /48), notation CIDR. */
  readonly ip: string | null;
  /** Ouverture de la famille (connexion), pas de la dernière rotation. */
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
}

/** Sessions valides de l'utilisateur du contexte, une par famille, la plus récente d'abord. */
export async function listSessions(tx: TransactionClient): Promise<SessionSummary[]> {
  const rows = await tx.$queryRaw<
    {
      family_id: string;
      user_agent: string | null;
      ip: string | null;
      created_at: Date;
      last_used_at: Date | null;
    }[]
  >`
    SELECT s.family_id::text, s.user_agent, s.ip::text AS ip,
      (SELECT min(f.created_at) FROM sessions f WHERE f.family_id = s.family_id) AS created_at,
      s.last_used_at
    FROM sessions s
    WHERE s.user_id = oz_current_user_id() AND s.revoked_at IS NULL AND s.deleted_at IS NULL
      AND s.expires_at > now()
    ORDER BY s.last_used_at DESC NULLS LAST, s.id DESC`;
  return rows.map((row) => ({
    familyId: row.family_id,
    device: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

/** Révoque la session (famille) `familyId` si elle est active et appartient à l'utilisateur du contexte. */
export async function revokeSession(tx: TransactionClient, familyId: string): Promise<boolean> {
  assertUuid(familyId);
  // Verrou de la famille (même ordre que la rotation) : une rotation concurrente ne la prolonge pas.
  // Une famille d'un autre compte n'est pas verrouillée : la RLS ne la laisse pas voir.
  await tx.$queryRaw`
    SELECT oz_sessions_lock_family(f.family_id)::text FROM (
      SELECT DISTINCT family_id FROM sessions
      WHERE family_id = ${familyId}::uuid AND user_id = oz_current_user_id()) f`;
  const revoked = await tx.$queryRaw<{ id: string }[]>`
    UPDATE sessions SET revoked_at = now(), revoked_reason = 'revoked_by_user'
    WHERE family_id = ${familyId}::uuid AND user_id = oz_current_user_id()
      AND revoked_at IS NULL AND deleted_at IS NULL AND expires_at > now()
    RETURNING id::text`;
  const target = revoked[0];
  if (target === undefined) return false;
  await tx.$executeRaw`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
    VALUES (oz_current_user_id(), 'user.session.revoked', 'session', ${target.id}::uuid,
      'Session révoquée par son titulaire')`;
  return true;
}

/** Déconnexion globale : révoque toutes les sessions de l'utilisateur du contexte. */
export async function revokeAllSessions(tx: TransactionClient): Promise<number> {
  // Familles verrouillées puis révoquées ; une famille ouverte ou tournée entre-temps est reprise au
  // passage suivant (au plus quelques passes : chaque passe ne laisse que les familles nées pendant).
  let total = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    await tx.$queryRaw`
      SELECT oz_sessions_lock_family(f.family_id)::text FROM (
        SELECT DISTINCT family_id FROM sessions
        WHERE user_id = oz_current_user_id() AND revoked_at IS NULL ORDER BY 1) f`;
    const count = await tx.$executeRaw`
      UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout_all'
      WHERE user_id = oz_current_user_id() AND revoked_at IS NULL`;
    if (count === 0) break;
    total += count;
  }
  if (total === 0) return 0;
  await tx.$executeRaw`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
    VALUES (oz_current_user_id(), 'user.session.logout_all', 'user', oz_current_user_id(),
      'Déconnexion de toutes les sessions')`;
  return total;
}

/** État d'une session pour la garde d'accès. */
export type SessionAccess = 'active' | 'email_unverified' | 'invalid';

/**
 * Garde d'accès (D2 du lot 1.3b) : `active` si la famille du jeton d'accès a encore une session
 * valide et si le compte de l'utilisateur du contexte est actif, vérifié et non supprimé ;
 * `email_unverified` si seule la vérification de l'email manque ; `invalid` sinon.
 */
export async function sessionAccess(
  tx: TransactionClient,
  familyId: string,
): Promise<SessionAccess> {
  assertUuid(familyId);
  const rows = await tx.$queryRaw<{ verified: boolean }[]>`
    SELECT u.email_verified_at IS NOT NULL AS verified
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.family_id = ${familyId}::uuid AND s.user_id = oz_current_user_id()
      AND s.revoked_at IS NULL AND s.deleted_at IS NULL AND s.expires_at > now()
      AND u.deleted_at IS NULL AND u.status = 'active'
    LIMIT 1`;
  const row = rows[0];
  if (row === undefined) return 'invalid';
  return row.verified ? 'active' : 'email_unverified';
}

/** Adresse de l'utilisateur du contexte, pour une alerte de sécurité ; NULL si le compte est supprimé. */
export async function accountEmail(tx: TransactionClient): Promise<string | null> {
  const rows = await tx.$queryRaw<{ email: string }[]>`
    SELECT email FROM users WHERE id = oz_current_user_id() AND deleted_at IS NULL`;
  return rows[0]?.email ?? null;
}
