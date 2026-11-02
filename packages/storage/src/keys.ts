// Clés du coffre (lot 1.9a, D2) : `incoming/` reçoit le dépôt signé, `quarantine/` le fichier
// réceptionné en attente d'analyse, `clean/` le fichier analysé et ré-encodé (lot 1.9b, D4). Aucune
// autre clé n'est admise : rien ne vient de l'utilisateur.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY =
  /^(incoming|quarantine|clean)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segment(id: string): string {
  if (!UUID.test(id)) throw new TypeError('identifiant de stockage : UUID attendu');
  return id;
}

export const incomingKey = (uploadId: string): string => `incoming/${segment(uploadId)}`;
export const quarantineKey = (documentId: string): string => `quarantine/${segment(documentId)}`;
export const cleanKey = (documentId: string): string => `clean/${segment(documentId)}`;

export function assertStorageKey(key: string): void {
  if (!KEY.test(key)) throw new TypeError('clé de stockage refusée');
}
