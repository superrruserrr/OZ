import type { AuthSqlClient } from './auth.js';

// Téléphone du compte (lot 1.3cc) : appel typé à la fonction de la migration 20261102090000_auth_phone
// (chemin privilégié D-059). Les clés arrivent en paramètre, jamais stockées en base.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;

export type PhoneOutcome = 'verified' | 'changed' | 'same';

/** Pose le numéro prouvé ; `null` si le compte ne peut plus tenir de session. */
export async function setVerifiedPhone(
  db: AuthSqlClient,
  input: {
    readonly userId: string;
    readonly phone: string;
    readonly encryptionKey: string;
    readonly blindIndexKey: string;
  },
): Promise<PhoneOutcome | null> {
  if (!UUID.test(input.userId)) throw new Error('Téléphone : identifiant UUID attendu.');
  if (!E164.test(input.phone)) throw new Error('Téléphone : numéro E.164 attendu.');
  const rows = await db.$queryRaw<{ outcome: PhoneOutcome | null }[]>`
    SELECT oz_auth_set_verified_phone(
      ${input.userId}::uuid, ${input.phone}, ${input.encryptionKey}, ${input.blindIndexKey}
    ) AS outcome`;
  return rows[0]?.outcome ?? null;
}
