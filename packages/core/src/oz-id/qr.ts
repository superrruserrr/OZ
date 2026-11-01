import qrcode from 'qrcode-generator';
import { isValidOzId, OzIdError } from './oz-id.js';

export interface ProfileQrOptions {
  /** Base des profils publics (`https://…`, ou `http://localhost` en développement), sans domaine en dur. */
  readonly baseUrl: string;
}

/** Schéma, hôte, port et chemin seulement : ni identifiants, ni requête, ni fragment. */
const BASE_URL = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d{1,5})?(\/[a-z0-9._~/-]*)?$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Marge réglementaire du QR (zone calme) : 4 modules. */
const QUIET_ZONE = 4;

/** URL du profil d'un OZ ID canonique (lot 1.13 pour la page elle-même). */
export function profileUrl(ozId: string, { baseUrl }: ProfileQrOptions): string {
  if (!isValidOzId(ozId)) throw new OzIdError('OZ_ID_INVALID_FORMAT', 'OZ ID canonique attendu');
  const match = BASE_URL.exec(baseUrl);
  const [, scheme = '', host = '', port = '', path = ''] = match ?? [];
  if (!match || (scheme.toLowerCase() === 'http' && !LOCAL_HOSTS.has(host.toLowerCase()))) {
    throw new Error('QR du profil : URL de base https:// attendue (http:// seulement en local)');
  }
  return `${scheme.toLowerCase()}://${host.toLowerCase()}${port}${path.replace(/\/+$/, '')}/${ozId}`;
}

/**
 * QR en SVG autonome : correction M, zone calme de 4 modules, un carré par module sombre. Aucun
 * script, lien ni texte : la donnée n'y figure qu'encodée.
 */
export function qrSvg(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const size = count + 2 * QUIET_ZONE;
  const squares: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col))
        squares.push(`M${String(col + QUIET_ZONE)} ${String(row + QUIET_ZONE)}h1v1h-1z`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}" shape-rendering="crispEdges">` +
    `<rect width="${String(size)}" height="${String(size)}" fill="#fff"/>` +
    `<path fill="#000" d="${squares.join('')}"/></svg>`
  );
}

/** QR du profil (EX-102 n° 7) : l'URL ne porte aucune donnée personnelle. */
export function profileQrSvg(ozId: string, options: ProfileQrOptions): string {
  return qrSvg(profileUrl(ozId, options));
}
