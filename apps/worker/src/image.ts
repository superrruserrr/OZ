import sharp, { type Metadata } from 'sharp';

// Ré-encodage des images (lot 1.9b, D5, EX-110 n° 5) : seuls les pixels traversent. Toute métadonnée
// (EXIF dont GPS, XMP, IPTC, ICC), tout segment annexe et tout octet après la fin d'image sont
// perdus au décodage ; l'orientation est appliquée avant. Bornes lues sur l'en-tête, avant décodage.

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type ImageOutcome =
  | {
      readonly ok: true;
      readonly data: Uint8Array;
      readonly width: number;
      readonly height: number;
      /** dHash 64 bits, en entier signé (colonne BIGINT). */
      readonly perceptualHash: bigint;
    }
  | { readonly ok: false; readonly reason: 'dimensions' | 'unreadable' | 'too_large' };

const MIN_SIDE = 200;
const MAX_SIDE = 8_000;
const MAX_PIXELS = 40_000_000;
/** Sortie du ré-encodage : borne du dépôt, 50 Mo (au-delà, rejet définitif, lot 1.9cb, D-099). */
const MAX_OUTPUT_BYTES = 52_428_800;
/** Bombe de calcul (JPEG progressif à passes multiples…) : libvips abandonne au-delà. */
const TIMEOUT_SECONDS = 30;

const FORMAT: Record<ImageMime, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Fichiers non fiables, un par analyse : ni cache d'opérations ni parallélisme interne. Réglage
// global au processus, voulu : le worker n'utilise sharp que pour ce ré-encodage.
sharp.cache(false);
sharp.concurrency(1);

// Image animée ou multipage (WebP, PNG animé) : seule la première image est décodée et gardée.
const input = (bytes: Uint8Array) =>
  sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error', autoOrient: true });

/** Contrôle, ré-encode dans le format d'origine et calcule l'empreinte perceptuelle. */
export async function processImage(
  bytes: Uint8Array,
  mime: ImageMime,
  maxOutputBytes = MAX_OUTPUT_BYTES,
): Promise<ImageOutcome> {
  const format = FORMAT[mime];
  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (meta.format !== format) {
    return { ok: false, reason: 'unreadable' };
  }
  // Dimensions d'affichage : une orientation 5 à 8 échange largeur et hauteur.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  if (
    Math.min(width, height) < MIN_SIDE ||
    Math.max(width, height) > MAX_SIDE ||
    width * height > MAX_PIXELS
  ) {
    return { ok: false, reason: 'dimensions' };
  }

  try {
    const decoded = input(bytes).toColourspace('srgb');
    const encoded =
      format === 'jpeg'
        ? decoded.jpeg({ quality: 90 })
        : format === 'png'
          ? decoded.png({ compressionLevel: 9 })
          : decoded.webp({ quality: 90 });
    const data = await encoded.timeout({ seconds: TIMEOUT_SECONDS }).toBuffer();
    // Une sortie plus lourde que la borne ne s'écrirait jamais sous `clean/` : rejet, sans nouvel essai.
    if (data.byteLength > maxOutputBytes) return { ok: false, reason: 'too_large' };
    return { ok: true, data, width, height, perceptualHash: await dHash(data) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * dHash : image réduite à 9 × 8 en niveaux de gris, un bit par paire de pixels voisins (gauche plus
 * clair que droite). Proche pour deux versions d'une même image, éloigné sinon.
 */
async function dHash(image: Uint8Array): Promise<bigint> {
  // Réduction exacte quel que soit le format : sans réduction au décodage propre au JPEG, une même
  // image en JPEG et en PNG garde une empreinte proche.
  const pixels = await sharp(image)
    .greyscale()
    .resize(9, 8, { fit: 'fill', kernel: 'lanczos3', fastShrinkOnLoad: false })
    .raw()
    .timeout({ seconds: TIMEOUT_SECONDS })
    .toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = pixels.readUInt8(y * 9 + x);
      const right = pixels.readUInt8(y * 9 + x + 1);
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, hash);
}

/** Nombre de bits différents entre deux empreintes 64 bits (comparaison au lot 1.10). */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (diff !== 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
