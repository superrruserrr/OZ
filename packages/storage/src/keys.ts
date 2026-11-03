// Clés du coffre (lot 1.9a, D2) : `incoming/` reçoit le dépôt signé, `quarantine/` le fichier
// réceptionné en attente d'analyse, `clean/` le fichier analysé et ré-encodé (lot 1.9b, D4). Aucune
// autre clé n'est admise : rien ne vient de l'utilisateur. `exports/<demande>.json` : archive d'export
// des données personnelles, écrite par le worker seul (lot 1.16bb, D2).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY =
  /^(incoming|quarantine|clean)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXPORT_KEY = /^exports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

function segment(id: string): string {
  if (!UUID.test(id)) throw new TypeError('identifiant de stockage : UUID attendu');
  return id;
}

export const incomingKey = (uploadId: string): string => `incoming/${segment(uploadId)}`;
export const quarantineKey = (documentId: string): string => `quarantine/${segment(documentId)}`;
export const cleanKey = (documentId: string): string => `clean/${segment(documentId)}`;

export const exportKey = (requestId: string): string => `exports/${segment(requestId)}.json`;

export function isExportKey(key: string): boolean {
  return EXPORT_KEY.test(key);
}

export function isStorageKey(key: string): boolean {
  return KEY.test(key) || EXPORT_KEY.test(key);
}

export function assertStorageKey(key: string): void {
  if (!isStorageKey(key)) throw new TypeError('clé de stockage refusée');
}
