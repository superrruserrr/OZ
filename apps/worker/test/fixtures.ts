// Fichiers synthétiques des tests du worker (lot 1.9b) : aucune donnée réelle.

/** PDF minimal valide à `pages` pages (table des références exacte). */
export function buildPdf(
  pages: number,
  options: { count?: number; trailer?: string; script?: boolean; content?: string } = {},
): Buffer {
  const kids = Array.from({ length: pages }, (_, i) => `${String(4 + i)} 0 R`).join(' ');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R${options.script === true ? ' /OpenAction 3 0 R' : ''} >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${String(options.count ?? pages)} >>`,
    // Action JavaScript (jamais exécutée : pdf.js 6 n'a pas de chemin `eval`, aucun rendu).
    `<< /S /JavaScript /JS (globalThis.ozPwned = true) >>`,
    ...Array.from(
      { length: pages },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200]${options.content === undefined ? '' : ` /Contents ${String(4 + pages)} 0 R`} >>`,
    ),
    // Flux de contenu non compressé partagé par les pages (ex. chaîne EICAR pour l'antivirus).
    ...(options.content === undefined
      ? []
      : [
          `<< /Length ${String(Buffer.byteLength(options.content, 'latin1'))} >>\nstream\n${options.content}\nendstream`,
        ]),
  ];
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R${options.trailer ?? ''} >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * Chaîne de test EICAR (inoffensive, reconnue par tous les antivirus), assemblée à l'exécution :
 * le fichier source n'est pas lui-même signalé par l'antivirus du poste.
 */
export function eicar(): string {
  return ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join('');
}
