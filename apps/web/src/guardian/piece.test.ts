// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkPiece, PIECE_MAX_BYTES, sniffPieceType } from './piece';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('type réel d’une pièce', () => {
  it('reconnaît PDF, JPEG, PNG et WebP par leur signature', () => {
    expect(sniffPieceType(new TextEncoder().encode('%PDF-1.4'))).toBe('application/pdf');
    expect(sniffPieceType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffPieceType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffPieceType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('refuse le reste, même nommé .pdf', () => {
    expect(sniffPieceType(new TextEncoder().encode('<svg>'))).toBeNull();
    expect(sniffPieceType(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(sniffPieceType(bytes())).toBeNull();
  });
});

describe('contrôle avant envoi', () => {
  it('taille nulle ou au-delà de 10 Mo : refusée', () => {
    expect(checkPiece(bytes())).toEqual({ ok: false, error: 'fileSize' });
    const big = new Uint8Array(PIECE_MAX_BYTES + 1);
    big.set(new TextEncoder().encode('%PDF-'));
    expect(checkPiece(big)).toEqual({ ok: false, error: 'fileSize' });
  });

  it('empreinte SHA-256 en hexadécimal minuscule', () => {
    const result = checkPiece(new TextEncoder().encode('%PDF-abc'));
    expect(result).toMatchObject({ ok: true, contentType: 'application/pdf', sizeBytes: 8 });
    expect(result.ok && result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
