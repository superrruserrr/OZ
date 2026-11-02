import { z } from 'zod';

// Dépôt de documents (lot 1.9a, EX-110) : le client envoie le fichier directement au stockage par
// une URL signée ; l'API ne voit que ces métadonnées, puis vérifie le fichier réel à la réception.

/** 50 Mo par fichier (requirements §270). */
export const DOCUMENT_UPLOAD_MAX_BYTES = 52_428_800;

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const IMAGES_AND_PDF = [...IMAGES, 'application/pdf'] as const;

/**
 * Types réels permis par type de document (D4) : jamais l'extension. HEIC refusé (non ré-encodable
 * de façon fiable), vidéo absente jusqu'à son lot.
 */
export const UPLOAD_CONTENT_TYPES = {
  photo: IMAGES,
  identity_document: IMAGES_AND_PDF,
  birth_certificate: IMAGES_AND_PDF,
  license: IMAGES_AND_PDF,
  organization_registration: IMAGES_AND_PDF,
} as const;

type UploadableDocumentType = keyof typeof UPLOAD_CONTENT_TYPES;

const UPLOADABLE = Object.keys(UPLOAD_CONTENT_TYPES) as [
  UploadableDocumentType,
  ...UploadableDocumentType[],
];
const target = z.uuid({ error: 'validation.document.target' }).optional();

export const documentUploadSchema = z
  .strictObject({
    documentType: z.enum(UPLOADABLE, { error: 'validation.document.type' }),
    playerId: target,
    guardianId: target,
    organizationId: target,
    contentType: z.enum(IMAGES_AND_PDF, { error: 'validation.document.contentType' }),
    sizeBytes: z
      .number({ error: 'validation.document.size' })
      .int({ error: 'validation.document.size' })
      .min(1, { error: 'validation.document.size' })
      .max(DOCUMENT_UPLOAD_MAX_BYTES, { error: 'validation.document.size' }),
    /** SHA-256 du fichier en hexadécimal minuscule, signé dans l'envoi (D1). */
    sha256: z.string().regex(/^[0-9a-f]{64}$/, { error: 'validation.document.sha256' }),
  })
  .superRefine((input, ctx) => {
    const targets = [input.playerId, input.guardianId, input.organizationId].filter(
      (id) => id !== undefined,
    );
    const forOrganization = input.documentType === 'organization_registration';
    if (targets.length !== 1 || (input.organizationId !== undefined) !== forOrganization) {
      ctx.addIssue({ code: 'custom', path: ['playerId'], message: 'validation.document.target' });
    }
    const allowed: readonly string[] = UPLOAD_CONTENT_TYPES[input.documentType];
    if (!allowed.includes(input.contentType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: 'validation.document.contentType',
      });
    }
  });
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

/** URL de dépôt PUT, valable 5 minutes, et en-têtes signés à renvoyer tels quels (D1). */
export const documentUploadOutputSchema = z.strictObject({
  uploadId: z.uuid(),
  url: z.url({ protocol: /^https?$/ }),
  method: z.literal('PUT'),
  headers: z.strictObject({
    'content-type': z.enum(IMAGES_AND_PDF),
    'content-length': z.string().regex(/^[1-9][0-9]*$/),
    'x-amz-checksum-sha256': z.base64(),
  }),
  expiresAt: z.iso.datetime(),
});
export type DocumentUploadOutput = z.infer<typeof documentUploadOutputSchema>;

export const documentUploadParamsSchema = z.strictObject({ id: z.uuid() });
export type DocumentUploadParamsInput = z.infer<typeof documentUploadParamsSchema>;

/** Le document existe, en attente d'analyse : jamais lisible avant `clean` (CP-21). */
export const documentUploadCompleteOutputSchema = z.strictObject({
  documentId: z.uuid(),
  status: z.literal('pending'),
});
export type DocumentUploadCompleteOutput = z.infer<typeof documentUploadCompleteOutputSchema>;

/** Message de la file `document-scan` (API → worker) : l'identifiant seul, le reste est relu en base. */
export const documentScanJobSchema = z.strictObject({ documentId: z.uuid() });
export type DocumentScanJobInput = z.infer<typeof documentScanJobSchema>;
