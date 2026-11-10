import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Curseur de la recherche (lot 1.14a, D6) : base64url d'une position (tri, sens, empreinte des
// critères, identifiant de la dernière ligne), suivie d'un HMAC tronqué lié au lecteur. Il ne porte
// aucune donnée de fiche ni critère en clair. Rejoué par un autre lecteur, avec d'autres critères ou
// un autre tri, altéré : refusé.

const MAC_BYTES = 16;
const MAC_LENGTH = 22; // base64url sans remplissage de 16 octets
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SearchPosition {
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  /** Empreinte des critères (`searchFingerprint`). */
  readonly fingerprint: string;
}

/** Empreinte stable des critères : clés triées, valeurs absentes ignorées. */
export function searchFingerprint(criteria: Readonly<Record<string, unknown>>): string {
  const canonical = Object.keys(criteria)
    .filter((key) => criteria[key] !== undefined)
    .sort()
    .map((key) => [key, criteria[key]]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('base64url').slice(0, 22);
}

const derive = (hmacKey: string): Buffer =>
  createHmac('sha256', hmacKey).update('oz/player-search-cursor/v1').digest();

const mac = (hmacKey: string, readerId: string, payload: string): string =>
  createHmac('sha256', derive(hmacKey))
    .update(`${readerId}\n${payload}`)
    .digest()
    .subarray(0, MAC_BYTES)
    .toString('base64url');

const serialize = (position: SearchPosition, afterId: string): string =>
  Buffer.from(
    JSON.stringify([1, position.sort, position.direction, position.fingerprint, afterId]),
    'utf8',
  ).toString('base64url');

export function sealSearchCursor(
  hmacKey: string,
  readerId: string,
  position: SearchPosition & { readonly afterId: string },
): string {
  const payload = serialize(position, position.afterId);
  return `${payload}${mac(hmacKey, readerId, payload)}`;
}

/** Identifiant de la dernière ligne ; `null` si le curseur n'est pas celui de cette recherche. */
export function openSearchCursor(
  hmacKey: string,
  readerId: string,
  cursor: string,
  expected: SearchPosition,
): string | null {
  if (cursor.length <= MAC_LENGTH) return null;
  const payload = cursor.slice(0, -MAC_LENGTH);
  const given = Buffer.from(cursor.slice(-MAC_LENGTH), 'utf8');
  const wanted = Buffer.from(mac(hmacKey, readerId, payload), 'utf8');
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded.length !== 5) return null;
  const [version, sort, direction, fingerprint, afterId] = decoded as unknown[];
  if (
    version !== 1 ||
    sort !== expected.sort ||
    direction !== expected.direction ||
    fingerprint !== expected.fingerprint ||
    typeof afterId !== 'string' ||
    !UUID.test(afterId)
  ) {
    return null;
  }
  return afterId;
}
