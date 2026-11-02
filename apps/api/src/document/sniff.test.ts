import { describe, expect, it } from 'vitest';
import { sniffContentType } from './sniff.js';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('sniffContentType (D3)', () => {
  it.each([
    // PNG 1 × 1 complet : sans son premier bloc, l'en-tête seul ne distingue pas PNG d'APNG.
    [
      'PNG',
      bytes(
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0,
        0,
        0,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0x08,
        0x06,
        0,
        0,
        0,
        0x1f,
        0x15,
        0xc4,
        0x89,
        0,
        0,
        0,
        0x0a,
        0x49,
        0x44,
        0x41,
        0x54,
        0x78,
        0x9c,
        0x63,
        0,
        0x01,
        0,
        0,
        0x05,
        0,
        0x01,
        0x0d,
        0x0a,
        0x2d,
        0xb4,
        0,
        0,
        0,
        0,
        0x49,
        0x45,
        0x4e,
        0x44,
        0xae,
        0x42,
        0x60,
        0x82,
      ),
      'image/png',
    ],
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1), 'image/jpeg'],
    ['WebP', text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'image/webp'],
    ['PDF', text('%PDF-1.7\n%âãÏÓ\n'), 'application/pdf'],
  ])('%s reconnu par ses octets de tête', async (_label, head, mime) => {
    expect(await sniffContentType(head)).toBe(mime);
  });

  it('l’extension et le type déclaré n’entrent pas en compte : seuls les octets décident', async () => {
    // Un exécutable Windows nommé « photo.png » reste un exécutable.
    const exe = new Uint8Array(256);
    exe.set([0x4d, 0x5a]);
    exe[0x3c] = 0x80;
    exe.set([0x50, 0x45, 0, 0], 0x80);
    expect(await sniffContentType(exe)).toBe('application/x-msdownload');
  });

  it('format inconnu, texte brut ou vide : null', async () => {
    expect(await sniffContentType(text('bonjour, ceci est du texte'))).toBeNull();
    expect(await sniffContentType(new Uint8Array(0))).toBeNull();
  });
});
