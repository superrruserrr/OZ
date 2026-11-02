import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  documentScanJobSchema,
  documentUploadCompleteOutputSchema,
  documentUploadOutputSchema,
  documentUploadParamsSchema,
  documentUploadSchema,
  UPLOAD_CONTENT_TYPES,
} from './upload.schema.js';

const UUID = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const SHA = 'ab'.repeat(32);
const valid = {
  documentType: 'identity_document',
  playerId: UUID,
  contentType: 'application/pdf',
  sizeBytes: 1234,
  sha256: SHA,
};
const withoutTarget = () => ({
  documentType: valid.documentType,
  contentType: valid.contentType,
  sizeBytes: valid.sizeBytes,
  sha256: valid.sha256,
});
const issues = (input: unknown) =>
  documentUploadSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

describe('documentUploadSchema (D4)', () => {
  it('accepte une demande conforme pour chaque cible', () => {
    expect(documentUploadSchema.parse(valid)).toEqual(valid);
    const rest = withoutTarget();
    expect(documentUploadSchema.safeParse({ ...rest, guardianId: UUID }).success).toBe(true);
    expect(
      documentUploadSchema.safeParse({
        ...rest,
        documentType: 'organization_registration',
        organizationId: UUID,
      }).success,
    ).toBe(true);
  });

  it('table des types permis : images partout, PDF hors photo, jamais HEIC ni vidéo', () => {
    expect(UPLOAD_CONTENT_TYPES).toEqual({
      photo: ['image/jpeg', 'image/png', 'image/webp'],
      identity_document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      birth_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      license: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      organization_registration: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    });
  });

  it.each([
    [
      'photo en PDF',
      { documentType: 'photo', contentType: 'application/pdf' },
      'validation.document.contentType',
    ],
    ['HEIC', { contentType: 'image/heic' }, 'validation.document.contentType'],
    ['vidéo', { documentType: 'video', contentType: 'video/mp4' }, 'validation.document.type'],
    ['taille nulle', { sizeBytes: 0 }, 'validation.document.size'],
    ['taille > 50 Mo', { sizeBytes: DOCUMENT_UPLOAD_MAX_BYTES + 1 }, 'validation.document.size'],
    ['taille décimale', { sizeBytes: 1.5 }, 'validation.document.size'],
    ['empreinte en majuscules', { sha256: SHA.toUpperCase() }, 'validation.document.sha256'],
    ['empreinte courte', { sha256: 'ab' }, 'validation.document.sha256'],
    ['cible mal formée', { playerId: 'x' }, 'validation.document.target'],
  ])('refuse : %s', (_label, override, message) => {
    expect(issues({ ...valid, ...override })).toContain(message);
  });

  it('exactement une cible', () => {
    const none = withoutTarget();
    expect(issues(none)).toContain('validation.document.target');
    expect(issues({ ...valid, organizationId: UUID })).toContain('validation.document.target');
  });

  it('justificatif d’organisation sur une organisation seulement, pièce de personne sur une personne', () => {
    expect(issues({ ...valid, documentType: 'organization_registration' })).toContain(
      'validation.document.target',
    );
    const rest = withoutTarget();
    expect(issues({ ...rest, organizationId: UUID })).toContain('validation.document.target');
  });

  it('refuse toute clé inconnue (CP-06)', () => {
    expect(documentUploadSchema.safeParse({ ...valid, storageKey: 'incoming/x' }).success).toBe(
      false,
    );
  });
});

describe('réponses et file', () => {
  const output = {
    uploadId: UUID,
    url: 'https://s3.fr-par.scw.cloud/oz-documents/incoming/x?X-Amz-Signature=abc',
    method: 'PUT',
    headers: {
      'content-type': 'application/pdf',
      'content-length': '1234',
      'x-amz-checksum-sha256': 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=',
    },
    expiresAt: '2026-11-03T10:05:00.000Z',
  };

  it('réponse d’intention : URL, PUT, en-têtes signés, échéance', () => {
    expect(documentUploadOutputSchema.parse(output)).toEqual(output);
    expect(documentUploadOutputSchema.safeParse({ ...output, method: 'POST' }).success).toBe(false);
    expect(
      documentUploadOutputSchema.safeParse({ ...output, storageKey: 'incoming/x' }).success,
    ).toBe(false);
    expect(
      documentUploadOutputSchema.safeParse({
        ...output,
        headers: { ...output.headers, authorization: 'x' },
      }).success,
    ).toBe(false);
  });

  it('réception : document en attente seulement', () => {
    expect(
      documentUploadCompleteOutputSchema.parse({ documentId: UUID, status: 'pending' }),
    ).toEqual({ documentId: UUID, status: 'pending' });
    expect(
      documentUploadCompleteOutputSchema.safeParse({ documentId: UUID, status: 'clean' }).success,
    ).toBe(false);
  });

  it('paramètre de route : UUID', () => {
    expect(documentUploadParamsSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(documentUploadParamsSchema.safeParse({ id: '../x' }).success).toBe(false);
  });

  it('message de file : identifiant du document seul', () => {
    expect(documentScanJobSchema.parse({ documentId: UUID })).toEqual({ documentId: UUID });
    expect(
      documentScanJobSchema.safeParse({ documentId: UUID, storageKey: 'quarantine/x' }).success,
    ).toBe(false);
  });
});
