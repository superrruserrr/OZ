import { z } from 'zod';

// Journal d'audit (lot 1.16a, EX-118 n° 1, EX-T11) : consultation par l'administrateur vérifié, de
// l'entrée la plus récente à la plus ancienne, page par page (curseur opaque, jamais `OFFSET`), et
// état de la dernière vérification de la chaîne (CP-23).

/** Curseur opaque rendu par la page précédente (base64url). */
const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const auditLogQuerySchema = z
  .strictObject({
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    action: z
      .string()
      .regex(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/)
      .max(120)
      .optional(),
    targetType: z
      .string()
      .regex(/^[a-z_]+$/)
      .max(64)
      .optional(),
    targetId: z.uuid().optional(),
    actorUserId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((query) => !query.from || !query.to || Date.parse(query.from) < Date.parse(query.to), {
    message: 'La période doit commencer avant de finir.',
    path: ['to'],
  });
export type AuditLogQueryInput = z.input<typeof auditLogQuerySchema>;
export type AuditLogQueryOutput = z.output<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.strictObject({
  id: z.uuid(),
  position: z.number().int().min(1),
  actorUserId: z.uuid().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.uuid().nullable(),
  reason: z.string(),
  requestId: z.string().nullable(),
  /** Métadonnées de l'entrée, sérialisées en JSON (aucun type ouvert dans un contrat). */
  metadata: z.string().max(10_000),
  createdAt: z.iso.datetime(),
  /** SHA-256 de l'entrée, en hexadécimal. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AuditLogEntryOutput = z.infer<typeof auditLogEntrySchema>;

export const auditLogPageSchema = z.strictObject({
  entries: z.array(auditLogEntrySchema).max(100),
  /** À repasser en `cursor` pour la page suivante ; `null` : dernière page. */
  nextCursor: cursor.nullable(),
});
export type AuditLogPageOutput = z.infer<typeof auditLogPageSchema>;

/** Dernière vérification de la chaîne par le worker. */
export const auditCheckSchema = z
  .strictObject({
    checkedAt: z.iso.datetime(),
    headPosition: z.number().int().min(0),
    /** `null` : vérifiée sans ancre externe (aucune ancre encore écrite). */
    anchorPosition: z.number().int().min(1).nullable(),
    isIntact: z.boolean(),
    defectPosition: z.number().int().min(1).nullable(),
  })
  .refine((check) => check.isIntact === (check.defectPosition === null), {
    message: 'Intègre si et seulement si aucune position en défaut.',
  });
export type AuditCheckOutput = z.infer<typeof auditCheckSchema>;

/** État d'intégrité ; `lastCheck` nul si la chaîne n'a encore jamais été vérifiée. */
export const auditIntegritySchema = z.strictObject({ lastCheck: auditCheckSchema.nullable() });
export type AuditIntegrityOutput = z.infer<typeof auditIntegritySchema>;
