import { z } from 'zod';

// Lecture d'un document (lot 1.9ca, EX-110 n° 6) : URL GET signée de 5 minutes au plus, délivrée
// pour une pièce saine seulement (CP-21). Ni clé de stockage ni métadonnée du document.

/** Identifiant de la pièce ; l'API répond le même 404 à un identifiant mal formé. */
export const documentReadParamsSchema = z.strictObject({ id: z.uuid() });
export type DocumentReadParamsInput = z.infer<typeof documentReadParamsSchema>;

export const documentReadOutputSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  expiresAt: z.iso.datetime(),
});
export type DocumentReadOutput = z.infer<typeof documentReadOutputSchema>;
