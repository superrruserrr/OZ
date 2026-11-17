import { createHash } from 'node:crypto';

/*
 * Contrôle d'une pièce du justificatif par le serveur du site (lot 1.7bc, B1, B2), avant tout envoi :
 * type réel lu dans les premiers octets (jamais l'extension ni le type annoncé par le navigateur),
 * taille bornée, empreinte SHA-256. L'API et le stockage refont leurs propres contrôles.
 */

/** 10 Mo par pièce à l'écran (B2) ; l'API en accepte 50. */
export const PIECE_MAX_BYTES = 10 * 1024 * 1024;

export type PieceType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

/** Type réel d'après la signature du fichier ; `null` pour tout autre contenu. */
export function sniffPieceType(bytes: Uint8Array): PieceType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'; // RIFF....WEBP
  return null;
}

export type PieceCheck =
  | {
      readonly ok: true;
      readonly contentType: PieceType;
      readonly sizeBytes: number;
      readonly sha256: string;
    }
  | { readonly ok: false; readonly error: 'fileSize' | 'fileType' };

export function checkPiece(bytes: Uint8Array): PieceCheck {
  if (bytes.length === 0 || bytes.length > PIECE_MAX_BYTES) return { ok: false, error: 'fileSize' };
  const contentType = sniffPieceType(bytes);
  if (contentType === null) return { ok: false, error: 'fileType' };
  return {
    ok: true,
    contentType,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
