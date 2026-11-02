import { fileTypeFromBuffer } from 'file-type';

/** Octets de tête que lit `file-type` pour reconnaître un format (sa constante `reasonableDetectionSizeInBytes`). */
export const SNIFF_BYTES = 4100;

/**
 * Type MIME réel d'après les octets de tête du fichier, jamais d'après l'extension ni le type déclaré
 * (D3 du lot 1.9a) ; `null` si le format n'est pas reconnu.
 */
export async function sniffContentType(head: Uint8Array): Promise<string | null> {
  if (head.length === 0) return null;
  return (await fileTypeFromBuffer(head))?.mime ?? null;
}
