import type { TransactionClient } from './session-context.js';

// Comptes (lot 1.3a, EX-103) : appels typés aux fonctions `oz_auth_*` de la migration
// 20261029100000_auth_comptes, qui forment le chemin privilégié des opérations faites sans
// utilisateur connecté (D-059). Mots de passe et jetons arrivent déjà hachés (`@oz/auth`).

/** Client capable d'exécuter une requête brute : client Prisma ou transaction. */
export type AuthSqlClient = Pick<TransactionClient, '$queryRaw'>;

export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'closed';

export interface AccountCredentials {
  readonly userId: string;
  /** NULL pour un compte créé sans mot de passe (seeds, import) : aucune connexion possible. */
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  readonly emailVerified: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

function assertTokenHash(tokenHash: string): void {
  if (!TOKEN_HASH.test(tokenHash)) {
    throw new Error('Jeton : empreinte SHA-256 hexadécimale attendue.');
  }
}

// Mêmes bornes que oz_auth_check_ttl : de 1 minute à 7 jours.
function assertTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7 * 86_400) {
    throw new Error('Jeton : durée de vie entière de 60 s à 7 jours attendue.');
  }
}

/** Crée le compte et son jeton de confirmation ; NULL si l'email est déjà pris. */
export async function registerUser(
  db: AuthSqlClient,
  input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly tokenHash: string;
    readonly ttlSeconds: number;
  },
): Promise<string | null> {
  assertTokenHash(input.tokenHash);
  assertTtl(input.ttlSeconds);
  const rows = await db.$queryRaw<{ id: string | null }[]>`
    SELECT oz_auth_register(${input.email}, ${input.passwordHash}, ${input.tokenHash},
      make_interval(secs => ${input.ttlSeconds}))::text AS id`;
  return rows[0]?.id ?? null;
}

/** Identifiants d'un compte non supprimé, ou NULL. */
export async function credentialsFor(
  db: AuthSqlClient,
  email: string,
): Promise<AccountCredentials | null> {
  const rows = await db.$queryRaw<
    {
      user_id: string;
      password_hash: string | null;
      status: AccountStatus;
      email_verified: boolean;
    }[]
  >`
    SELECT user_id::text, password_hash, status::text AS status, email_verified
    FROM oz_auth_credentials(${email})`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    userId: row.user_id,
    passwordHash: row.password_hash,
    status: row.status,
    emailVerified: row.email_verified,
  };
}

/** Consomme un jeton de confirmation : vrai si l'email du compte est désormais vérifié. */
export async function verifyEmail(db: AuthSqlClient, tokenHash: string): Promise<boolean> {
  assertTokenHash(tokenHash);
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_verify_email(${tokenHash}) AS ok`;
  return rows[0]?.ok === true;
}

/** Crée un jeton de réinitialisation ; renvoie le compte concerné, ou NULL (rien n'est révélé). */
export async function requestPasswordReset(
  db: AuthSqlClient,
  input: { readonly email: string; readonly tokenHash: string; readonly ttlSeconds: number },
): Promise<string | null> {
  assertTokenHash(input.tokenHash);
  assertTtl(input.ttlSeconds);
  const rows = await db.$queryRaw<{ id: string | null }[]>`
    SELECT oz_auth_request_password_reset(${input.email}, ${input.tokenHash},
      make_interval(secs => ${input.ttlSeconds}))::text AS id`;
  return rows[0]?.id ?? null;
}

/** Consomme le jeton et remplace le mot de passe ; renvoie l'email du compte, ou NULL. */
export async function resetPassword(
  db: AuthSqlClient,
  input: { readonly tokenHash: string; readonly passwordHash: string },
): Promise<string | null> {
  assertTokenHash(input.tokenHash);
  const rows = await db.$queryRaw<{ email: string | null }[]>`
    SELECT oz_auth_reset_password(${input.tokenHash}, ${input.passwordHash}) AS email`;
  return rows[0]?.email ?? null;
}

/**
 * Remplace un hash périmé, seulement s'il n'a pas changé entre-temps. `db` doit porter le contexte du
 * titulaire (`withUserContext`), posé après vérification du mot de passe : la base le refuse sinon.
 */
export async function rehashPassword(
  db: AuthSqlClient,
  input: { readonly userId: string; readonly oldHash: string; readonly newHash: string },
): Promise<boolean> {
  if (!UUID.test(input.userId)) throw new Error('Compte : identifiant UUID attendu.');
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_rehash_password(${input.userId}::uuid, ${input.oldHash}, ${input.newHash}) AS ok`;
  return rows[0]?.ok === true;
}
