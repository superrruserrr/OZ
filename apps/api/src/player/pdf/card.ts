import { LEVELS } from './profile.js';
import { drawQr, finish, graphemes, newDocument, winAnsi } from './render.js';

// Carte OZ ID (lot 1.13b, EX-119, D2) : format ID-1 (85,6 × 54 mm), sans photo (initiales à la
// place, dette D-123) ; OZ ID, nom, badge à la date d'édition, QR vers le profil, date d'édition et
// rappel que le statut en ligne fait foi. Ni date de naissance, ni téléphone, ni ville.

const MM = 72 / 25.4;
export const CARD_SIZE: [number, number] = [85.6 * MM, 54 * MM];

export interface CardData {
  readonly ozId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly verificationLevel: 0 | 1 | 2;
  /** Statut à l'édition : suspendu ou refusé prime sur le niveau. */
  readonly verificationStatus: string;
  /** URL du profil encodée dans le QR (sans donnée personnelle). */
  readonly profileUrl: string;
  readonly issuedAt: Date;
}

/** Badge à la date d'édition : une vérification suspendue ou refusée n'affiche aucun niveau. */
export function badgeOf(card: Pick<CardData, 'verificationLevel' | 'verificationStatus'>): string {
  if (card.verificationStatus === 'suspended') return 'Vérification suspendue';
  if (card.verificationStatus === 'rejected') return 'Vérification refusée';
  return LEVELS[card.verificationLevel] ?? '';
}

export const initialsOf = (firstName: string, lastName: string): string =>
  winAnsi(
    `${graphemes(firstName.trim())[0] ?? ''}${graphemes(lastName.trim())[0] ?? ''}`.toUpperCase(),
  ) || '?';

export async function cardPdf(card: CardData): Promise<Buffer> {
  const doc = newDocument({ title: 'Carte OZ ID', issuedAt: card.issuedAt }, CARD_SIZE, 0);
  const [width, height] = CARD_SIZE;
  const pad = 4 * MM;
  doc.roundedRect(0, 0, width, height, 3 * MM).fill('#0b1f17');
  // Initiales à la place de la photo.
  doc.circle(pad + 7 * MM, pad + 7 * MM, 7 * MM).fill('#1f4d3a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14);
  doc.text(initialsOf(card.firstName, card.lastName), pad, pad + 4.6 * MM, {
    width: 14 * MM,
    align: 'center',
    lineBreak: false,
  });
  const textX = pad + 17 * MM;
  const textWidth = width - textX - 24 * MM;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
  // Une ligne au plus, coupée par « … » : `ellipsis` n'agit qu'avec une hauteur bornée.
  doc.text(winAnsi(`${card.firstName} ${card.lastName}`), textX, pad + 1 * MM, {
    width: textWidth,
    height: 12,
    ellipsis: true,
  });
  doc.font('Helvetica').fontSize(7).fillColor('#a7f3d0');
  doc.text(badgeOf(card), textX, pad + 6 * MM, { width: textWidth, height: 9, ellipsis: true });
  doc.font('Courier-Bold').fontSize(11).fillColor('#34d399');
  doc.text(card.ozId, pad, height - pad - 14 * MM, { lineBreak: false });
  doc.font('Helvetica').fontSize(5.5).fillColor('#d1d5db');
  doc.text(
    winAnsi(
      `Édition du ${card.issuedAt.toISOString().slice(0, 10)} — le statut en ligne fait foi.`,
    ),
    pad,
    height - pad - 6 * MM,
    { width: width - 2 * pad - 22 * MM, lineBreak: false },
  );
  drawQr(doc, card.profileUrl, width - pad - 20 * MM, height - pad - 20 * MM, 20 * MM);
  return finish(doc);
}
