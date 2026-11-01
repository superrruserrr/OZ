import type { AuthSqlClient } from './auth.js';

// 2FA TOTP (lot 1.3cb) : appels typés aux fonctions de la migration 20261101100000_auth_totp (chemin
// privilégié D-059 : la vérification précède l'ouverture de session). La clé de chiffrement n'est
// jamais stockée en base : elle arrive en paramètre de chaque appel qui en a besoin.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_HASH = /^[0-9a-f]{64}$/;
const SECRET = /^[A-Z2-7]{32}$/;
const RECOVERY_BATCH = 10;

function assertUuid(id: string | null): void {
  if (id !== null && !UUID.test(id)) throw new Error('2FA : identifiant UUID attendu.');
}

function assertSecret(secret: string): void {
  if (!SECRET.test(secret)) throw new Error('2FA : secret base32 de 32 caractères attendu.');
}

function assertStep(step: number): void {
  if (!Number.isSafeInteger(step) || step < 0)
    throw new Error('2FA : pas de temps entier attendu.');
}

function assertCodeHash(hash: string): void {
  if (!CODE_HASH.test(hash))
    throw new Error('2FA : empreinte hexadécimale de 64 caractères attendue.');
}

function assertBatch(hashes: readonly string[]): void {
  if (hashes.length !== RECOVERY_BATCH) throw new Error('2FA : lot de dix empreintes attendu.');
  hashes.forEach(assertCodeHash);
}

export interface TotpState {
  /** Secret actif, en clair : NULL si la 2FA n'est pas active. */
  readonly secret: string | null;
  /** Secret d'un enrôlement en cours, en clair. */
  readonly pendingSecret: string | null;
  readonly lastStep: number | null;
  /** Un rôle du compte impose la 2FA (EX-103 n° 7). */
  readonly required: boolean;
  /** Empreinte du hash du mot de passe : change avec lui, sans rien en révéler. */
  readonly credentialStamp: string;
}

/** État 2FA ; NULL si le compte ne peut pas tenir de session (suspendu, clos, non vérifié). */
export async function totpState(
  db: AuthSqlClient,
  userId: string,
  key: string,
): Promise<TotpState | null> {
  assertUuid(userId);
  const rows = await db.$queryRaw<
    {
      secret: string | null;
      pending_secret: string | null;
      last_step: bigint | null;
      required: boolean;
      credential_stamp: string;
    }[]
  >`SELECT * FROM oz_auth_totp_state(${userId}::uuid, ${key})`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    secret: row.secret,
    pendingSecret: row.pending_secret,
    lastStep: row.last_step === null ? null : Number(row.last_step),
    required: row.required,
    credentialStamp: row.credential_stamp,
  };
}

/** Pose le secret en attente, sans toucher au secret actif. */
export async function beginTotp(
  db: AuthSqlClient,
  input: { readonly userId: string; readonly secret: string; readonly key: string },
): Promise<boolean> {
  assertUuid(input.userId);
  assertSecret(input.secret);
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_totp_begin(${input.userId}::uuid, ${input.secret}, ${input.key}) AS ok`;
  return rows[0]?.ok === true;
}

/**
 * Active le secret en attente s'il est bien celui qui vient d'être vérifié, pose les codes de
 * secours et révoque les sessions des autres appareils. Faux si un enrôlement concurrent l'a remplacé.
 */
export async function enableTotp(
  db: AuthSqlClient,
  input: {
    readonly userId: string;
    readonly secret: string;
    readonly step: number;
    readonly recoveryHashes: readonly string[];
    readonly key: string;
    readonly keepFamilyId: string | null;
  },
): Promise<boolean> {
  assertUuid(input.userId);
  assertUuid(input.keepFamilyId);
  assertSecret(input.secret);
  assertStep(input.step);
  assertBatch(input.recoveryHashes);
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_totp_enable(
      ${input.userId}::uuid, ${input.secret}, ${input.step}::bigint,
      ${[...input.recoveryHashes]}::text[], ${input.key}, ${input.keepFamilyId}::uuid
    ) AS ok`;
  return rows[0]?.ok === true;
}

export type TotpDisableOutcome = 'disabled' | 'required' | 'inactive';

/** Désactive la 2FA, sauf si un rôle l'impose (D6), et révoque les autres sessions (D7). */
export async function disableTotp(
  db: AuthSqlClient,
  input: { readonly userId: string; readonly keepFamilyId: string | null },
): Promise<TotpDisableOutcome> {
  assertUuid(input.userId);
  assertUuid(input.keepFamilyId);
  const rows = await db.$queryRaw<{ outcome: TotpDisableOutcome }[]>`
    SELECT oz_auth_totp_disable(${input.userId}::uuid, ${input.keepFamilyId}::uuid) AS outcome`;
  return rows[0]?.outcome ?? 'inactive';
}

/** Anti-rejeu atomique : vrai pour la seule vérification qui consomme ce pas. */
export async function consumeTotpStep(
  db: AuthSqlClient,
  userId: string,
  step: number,
): Promise<boolean> {
  assertUuid(userId);
  assertStep(step);
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_totp_consume_step(${userId}::uuid, ${step}::bigint) AS ok`;
  return rows[0]?.ok === true;
}

/** Consomme un code de secours : nombre de codes restants, ou NULL si le code est refusé. */
export async function consumeRecoveryCode(
  db: AuthSqlClient,
  userId: string,
  codeHash: string,
): Promise<number | null> {
  assertUuid(userId);
  assertCodeHash(codeHash);
  const rows = await db.$queryRaw<{ remaining: number | null }[]>`
    SELECT oz_auth_totp_consume_recovery(${userId}::uuid, ${codeHash}) AS remaining`;
  return rows[0]?.remaining ?? null;
}

/** Remplace tout le lot de codes de secours ; faux si la 2FA n'est pas active. */
export async function replaceRecoveryCodes(
  db: AuthSqlClient,
  userId: string,
  hashes: readonly string[],
): Promise<boolean> {
  assertUuid(userId);
  assertBatch(hashes);
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT oz_auth_totp_replace_recovery(${userId}::uuid, ${[...hashes]}::text[]) AS ok`;
  return rows[0]?.ok === true;
}
