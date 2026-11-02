import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hammingDistance, processImage, type ImageMime } from './image.js';

// Ré-encodage et contrôles des images (lot 1.9b, tâche 4, D5) : bornes, métadonnées, charge annexe, dHash.

const PAYLOAD = '<script>alert("oz")</script>';

/** Image synthétique en dégradé (motif stable pour l'empreinte perceptuelle). */
async function picture(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp',
  options: { exif?: boolean; orientation?: number } = {},
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      // Motif non monotone à basse fréquence : un simple dégradé donnerait une empreinte nulle
      // (stable par construction), un motif fin une moyenne uniforme à 9 × 8.
      raw[i] = Math.floor(127.5 + 127.5 * Math.sin((x / width) * Math.PI * 3));
      raw[i + 1] = Math.floor(127.5 + 127.5 * Math.cos((y / height) * Math.PI * 2 + x / width));
      raw[i + 2] = Math.floor(((x + y) / (width + height)) * 255);
    }
  }
  let image = sharp(raw, { raw: { width, height, channels: 3 } });
  if (options.exif === true || options.orientation !== undefined) {
    image = image.withMetadata({
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.exif === true
        ? {
            exif: {
              IFD0: { Artist: 'Personne Réelle', Copyright: PAYLOAD },
              IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '4/1 3/1 0/1' },
            },
          }
        : {}),
    });
  }
  return image.toFormat(format).toBuffer();
}

const MIME: Record<'jpeg' | 'png' | 'webp', ImageMime> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

describe('ré-encodage (EX-110 n° 5)', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    '%s : même format, dimensions rendues, aucune métadonnée',
    async (format) => {
      const input = await picture(640, 480, format, { exif: true });
      expect((await sharp(input).metadata()).exif).toBeDefined();
      const out = await processImage(input, MIME[format]);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect({ width: out.width, height: out.height }).toEqual({ width: 640, height: 480 });
      const meta = await sharp(out.data).metadata();
      expect(meta.format).toBe(format);
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(Buffer.from(out.data).includes('Personne')).toBe(false);
      expect(Buffer.from(out.data).includes(PAYLOAD)).toBe(false);
    },
  );

  it.each(['jpeg', 'png', 'webp'] as const)(
    '%s piégé : octets ajoutés après la fin d’image absents de la sortie',
    async (format) => {
      const trapped = Buffer.concat([await picture(320, 240, format), Buffer.from(PAYLOAD)]);
      const out = await processImage(trapped, MIME[format]);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(Buffer.from(out.data).includes(PAYLOAD)).toBe(false);
    },
  );

  it('PNG piégé : segment texte annexe (tEXt) absent de la sortie', async () => {
    const png = await sharp(await picture(320, 240, 'png'))
      .withMetadata()
      .png()
      .toBuffer();
    // Segment tEXt inséré juste après IHDR (8 octets de signature + 25 octets d'IHDR).
    const text = Buffer.from(`Comment\0${PAYLOAD}`);
    const chunk = Buffer.alloc(12 + text.length);
    chunk.writeUInt32BE(text.length, 0);
    chunk.write('tEXt', 4);
    text.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + text.length)), 8 + text.length);
    const trapped = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
    expect(trapped.includes(PAYLOAD)).toBe(true);
    const out = await processImage(trapped, 'image/png');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Buffer.from(out.data).includes(PAYLOAD)).toBe(false);
  });

  it('JPEG : commentaire (COM) et XMP absents de la sortie', async () => {
    const jpeg = await sharp(await picture(320, 240, 'jpeg'))
      .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><oz>${PAYLOAD}</oz></x:xmpmeta>`)
      .jpeg()
      .toBuffer();
    // Segment COM (FF FE) inséré après SOI.
    const comment = Buffer.from(PAYLOAD);
    const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, comment.length + 2]), comment]);
    const trapped = Buffer.concat([jpeg.subarray(0, 2), com, jpeg.subarray(2)]);
    expect(trapped.includes(PAYLOAD)).toBe(true);
    const out = await processImage(trapped, 'image/jpeg');
    if (!out.ok) throw new Error('image refusée');
    expect(Buffer.from(out.data).includes(PAYLOAD)).toBe(false);
    expect((await sharp(out.data).metadata()).xmp).toBeUndefined();
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    '%s : orientation EXIF appliquée puis supprimée',
    async (format) => {
      const input = await picture(640, 480, format, { orientation: 6 });
      const out = await processImage(input, MIME[format]);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect({ width: out.width, height: out.height }).toEqual({ width: 480, height: 640 });
      expect((await sharp(out.data).metadata()).orientation).toBeUndefined();
    },
  );
});

describe('bornes (D5)', () => {
  it.each([
    ['côté court < 200 px', 199, 400],
    ['côté long > 8 000 px', 8_001, 300],
  ])('%s → rejected/dimensions', async (_label, width, height) => {
    const out = await processImage(await picture(width, height, 'png'), 'image/png');
    expect(out).toEqual({ ok: false, reason: 'dimensions' });
  });

  it('limites incluses : 200 px et 8 000 px acceptés', async () => {
    const out = await processImage(await picture(8_000, 200, 'png'), 'image/png');
    expect(out.ok).toBe(true);
  });

  it('> 40 Mpx (bombe de décompression) refusé sur l’en-tête, sans décoder l’image', async () => {
    // PNG de 7 000 × 7 000 (49 Mpx) uni : quelques Ko compressés, 147 Mo décodés.
    const bomb = await sharp({
      create: { width: 7_000, height: 7_000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.byteLength).toBeLessThan(1_000_000);
    const before = process.memoryUsage().rss;
    expect(await processImage(bomb, 'image/png')).toEqual({ ok: false, reason: 'dimensions' });
    expect(process.memoryUsage().rss - before).toBeLessThan(100 * 1024 * 1024);
  });

  it.each([
    ['tronqué', async () => (await picture(320, 240, 'png')).subarray(0, 100), 'image/png'],
    ['aléatoire', () => Promise.resolve(Buffer.from('pas une image du tout')), 'image/jpeg'],
    ['format différent du type vérifié', () => picture(320, 240, 'png'), 'image/jpeg'],
  ] as const)('%s → rejected/unreadable', async (_label, make, mime) => {
    expect(await processImage(await make(), mime)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('empreinte perceptuelle (dHash 64 bits)', () => {
  it('stable après ré-encodage (distance ≤ 4), distincte d’une autre image', async () => {
    expect((await processImage(await picture(640, 480, 'png'), 'image/png')).ok).toBe(true);
    const first = await processImage(await picture(640, 480, 'jpeg'), 'image/jpeg');
    if (!first.ok) throw new Error('image refusée');
    const again = await processImage(Buffer.from(first.data), 'image/jpeg');
    if (!again.ok) throw new Error('image refusée');
    expect(hammingDistance(first.perceptualHash, again.perceptualHash)).toBeLessThanOrEqual(4);

    const flipped = await sharp(await picture(640, 480, 'jpeg'))
      .flop()
      .jpeg()
      .toBuffer();
    const other = await processImage(flipped, 'image/jpeg');
    if (!other.ok) throw new Error('image refusée');
    expect(hammingDistance(first.perceptualHash, other.perceptualHash)).toBeGreaterThan(4);
  });

  it('même image en JPEG et en PNG : empreintes proches (distance ≤ 6)', async () => {
    const jpeg = await processImage(await picture(1600, 1200, 'jpeg'), 'image/jpeg');
    const png = await processImage(await picture(1600, 1200, 'png'), 'image/png');
    if (!jpeg.ok || !png.ok) throw new Error('image refusée');
    expect(jpeg.perceptualHash).not.toBe(0n);
    expect(hammingDistance(jpeg.perceptualHash, png.perceptualHash)).toBeLessThanOrEqual(6);
  });

  it('entier signé 64 bits (colonne BIGINT)', async () => {
    const out = await processImage(await picture(320, 240, 'png'), 'image/png');
    if (!out.ok) throw new Error('image refusée');
    expect(out.perceptualHash).toBe(BigInt.asIntN(64, out.perceptualHash));
  });

  it('distance de Hamming', () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0n, -1n)).toBe(64);
    expect(hammingDistance(0b1011n, 0b0001n)).toBe(2);
  });
});
