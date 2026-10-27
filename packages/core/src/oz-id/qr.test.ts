import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { formatOzId, OzIdError } from './oz-id.js';
import { profileQrSvg, profileUrl } from './qr.js';

// jsqr (décodeur de test) est un module CommonJS : chargé par `require`, typé ici au strict nécessaire.
type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const jsQR = createRequire(import.meta.url)('jsqr') as JsQr;

const OZ_ID = formatOzId({ country: 'CM', year: 26, random: '7K4M9Q' });
const PIXELS_PER_MODULE = 4;

/** Rastérise le SVG produit (carrés `M x y h1v1h-1z`) et le décode comme le ferait un téléphone. */
function decode(svg: string): string | undefined {
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  const width = size * PIXELS_PER_MODULE;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let dy = 0; dy < PIXELS_PER_MODULE; dy += 1) {
      for (let dx = 0; dx < PIXELS_PER_MODULE; dx += 1) {
        const px = Number(x) * PIXELS_PER_MODULE + dx;
        const py = Number(y) * PIXELS_PER_MODULE + dy;
        data.fill(0, (py * width + px) * 4, (py * width + px) * 4 + 3);
      }
    }
  }
  return jsQR(data, width, width)?.data;
}

describe('profileUrl', () => {
  it.each([
    ['https://oz.example', 'https://oz.example/OZ-CM-26-7K4M9Q-M'],
    ['https://oz.example/', 'https://oz.example/OZ-CM-26-7K4M9Q-M'],
    ['https://oz.example/p/', 'https://oz.example/p/OZ-CM-26-7K4M9Q-M'],
    ['http://localhost:3000/p', 'http://localhost:3000/p/OZ-CM-26-7K4M9Q-M'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000/OZ-CM-26-7K4M9Q-M'],
  ])('%s → %s', (baseUrl, expected) => {
    expect(profileUrl(OZ_ID, { baseUrl })).toBe(expected);
  });

  it.each([
    'http://oz.example',
    'ftp://oz.example',
    'javascript:alert(1)',
    'https://user:secret@oz.example',
    'https://oz.example/?ref=qr',
    'https://oz.example/#profil',
    'oz.example',
    '',
  ])('refuse l’URL de base « %s »', (baseUrl) => {
    expect(() => profileUrl(OZ_ID, { baseUrl })).toThrow(/URL de base/);
  });

  it('refuse un OZ ID invalide, même en forme dictée', () => {
    expect(() => profileUrl('OZ-CM-26-7K4M9Q-3', { baseUrl: 'https://oz.example' })).toThrow(
      OzIdError,
    );
    expect(() => profileUrl('oz-cm-26-7k4m9q-m', { baseUrl: 'https://oz.example' })).toThrow(
      OzIdError,
    );
  });
});

describe('profileQrSvg (EX-102 n° 7)', () => {
  it('se décode exactement en l’URL du profil', () => {
    const svg = profileQrSvg(OZ_ID, { baseUrl: 'https://oz.example/p' });
    expect(decode(svg)).toBe('https://oz.example/p/OZ-CM-26-7K4M9Q-M');
  });

  it('garde une marge de 4 modules et des modules nets', () => {
    const svg = profileQrSvg(OZ_ID, { baseUrl: 'https://oz.example' });
    const coordinates = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].flatMap(([, x, y]) => [
      Number(x),
      Number(y),
    ]);
    const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
    expect(Math.min(...coordinates)).toBe(4);
    expect(Math.max(...coordinates)).toBe(size - 5);
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('ne contient ni script, ni lien, ni texte : l’URL n’y figure qu’encodée', () => {
    const svg = profileQrSvg(OZ_ID, { baseUrl: 'https://oz.example' });
    expect(svg).not.toMatch(/<script|href|<a[\s>]|<text|<foreignObject|on\w+=/i);
    expect(svg).not.toContain(OZ_ID);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*<\/svg>$/s);
  });
});
