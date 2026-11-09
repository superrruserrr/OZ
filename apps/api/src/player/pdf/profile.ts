import type { PlayerProfileOutput } from '@oz/contracts';
import { finish, newDocument, winAnsi } from './render.js';

// Export PDF de la fiche (lot 1.13b, EX-115 n° 5, D1) : la vue du lecteur, champ pour champ, avec
// un filigrane individualisé sur chaque page (plan R8, anti-aspiration). Aucun champ n'est ajouté :
// le document ne porte que ce que la réponse JSON du même lecteur porte.

/** Champs techniques de la vue, jamais imprimés (identifiants internes). */
export const UNPRINTED_FIELDS = ['id', 'organizationId'] as const;

const LABELS: Record<
  Exclude<keyof PlayerProfileOutput, (typeof UNPRINTED_FIELDS)[number]>,
  string
> = {
  ozId: 'OZ ID',
  firstName: 'Prénom',
  lastName: 'Nom',
  birthDate: 'Date de naissance',
  birthYear: 'Année de naissance',
  nationality: 'Nationalité',
  country: 'Pays',
  region: 'Région',
  city: 'Ville',
  primaryPosition: 'Poste principal',
  secondaryPosition: 'Poste secondaire',
  dominantFoot: 'Pied fort',
  heightCm: 'Taille (cm)',
  weightKg: 'Poids (kg)',
  verificationStatus: 'Statut de vérification',
  verificationLevel: 'Niveau de vérification',
  phone: 'Téléphone',
};

const POSITIONS: Record<string, string> = {
  goalkeeper: 'Gardien',
  centre_back: 'Défenseur central',
  full_back: 'Latéral',
  defensive_midfielder: 'Milieu défensif',
  central_midfielder: 'Milieu central',
  attacking_midfielder: 'Milieu offensif',
  winger: 'Ailier',
  striker: 'Attaquant',
};
const FEET: Record<string, string> = { left: 'Gauche', right: 'Droit', both: 'Les deux' };
const STATUSES: Record<string, string> = {
  declared: 'Déclaré',
  pending: 'En attente',
  in_review: 'En cours d’examen',
  verified: 'Vérifié',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};
export const LEVELS: Record<number, string> = {
  0: 'Email vérifié',
  1: 'Email et téléphone vérifiés',
  2: 'Identité vérifiée',
};

function valueOf(key: keyof typeof LABELS, value: unknown): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
  if (text === null) return '—';
  if (key === 'primaryPosition' || key === 'secondaryPosition') return POSITIONS[text] ?? '—';
  if (key === 'dominantFoot') return FEET[text] ?? '—';
  if (key === 'verificationStatus') return STATUSES[text] ?? '—';
  if (key === 'verificationLevel') return LEVELS[Number(text)] ?? '—';
  return text;
}

/** Lignes imprimées : libellé et valeur de chaque champ présent dans la vue, dans l'ordre fixe. */
export function printedRows(view: PlayerProfileOutput): [string, string][] {
  return (Object.keys(LABELS) as (keyof typeof LABELS)[])
    .filter((key) => key in view)
    .map((key) => [LABELS[key], valueOf(key, view[key])]);
}

export interface ProfileWatermark {
  /** Email masqué du lecteur (`j***@example.test`). */
  readonly reader: string;
  readonly role: string;
  readonly issuedAt: Date;
}

/** Filigrane du lecteur : texte de la diagonale et du pied de page. */
export function watermarkText(mark: ProfileWatermark): string {
  return `Exporté par ${mark.reader} (${mark.role}) le ${mark.issuedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function stamp(doc: PDFKit.PDFDocument, text: string): void {
  const { width, height } = doc.page;
  // Sans marge le temps du tampon : un texte sous la marge basse ouvrirait une page (récursion).
  const margins = { ...doc.page.margins };
  const [x, y] = [doc.x, doc.y];
  // La diagonale déborde la page avant rotation : bornes élargies (jamais de saut de page).
  doc.page.margins = { top: -height, bottom: -2 * height, left: -width, right: -width };
  doc.save();
  doc.fillColor('#9ca3af').fillOpacity(0.25).font('Helvetica-Bold').fontSize(14);
  doc.rotate(-35, { origin: [width / 2, height / 2] });
  for (let y = -height / 2; y < height * 1.5; y += 120) {
    doc.text(winAnsi(text), -width / 2, y, { width: width * 2, align: 'center', lineBreak: false });
  }
  doc.restore();
  doc.save().fillColor('#6b7280').font('Helvetica').fontSize(8);
  doc.text(winAnsi(text), margins.left, height - 32, {
    width: width - margins.left - margins.right,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
  doc.page.margins = margins;
  doc.x = x;
  doc.y = y;
}

/** PDF de la vue `view`, filigrané au nom du lecteur sur chaque page. */
export async function profilePdf(
  view: PlayerProfileOutput,
  mark: ProfileWatermark,
): Promise<Buffer> {
  const doc = newDocument({ title: 'Fiche joueur OZ', issuedAt: mark.issuedAt });
  const text = watermarkText(mark);
  doc.on('pageAdded', () => {
    stamp(doc, text);
    // pdfkit garde la police hors de save/restore : celle du corps est reposée après le tampon.
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
  });
  stamp(doc, text);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(20).text('Fiche joueur OZ', 48, 56);
  doc.moveDown(0.5).font('Helvetica').fontSize(9).fillColor('#4b5563');
  doc.text(winAnsi('Vue réservée au lecteur nommé ci-dessous ; le statut en ligne fait foi.'));
  doc.moveDown(1);
  for (const [label, value] of printedRows(view)) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(winAnsi(label), 48, doc.y, {
      continued: true,
    });
    doc.font('Helvetica').text(`  ${winAnsi(value)}`);
    doc.moveDown(0.3);
  }
  return finish(doc);
}
