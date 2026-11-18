import 'server-only';
import {
  accountDeletionStatusOutputSchema,
  dataExportStatusOutputSchema,
  type AccountDeletionOutput,
  type DataExportOutput,
} from '@oz/contracts';
import { signupFetch } from '../onboarding/signup-api';

/** Suivi lu par le serveur du site (ADR-010) ; `undefined` : momentanément illisible. */
export async function readExportStatus(): Promise<DataExportOutput | null | undefined> {
  const result = await signupFetch('/account/data-export', { method: 'GET' });
  if (result === null || !result.ok) return undefined;
  const out = dataExportStatusOutputSchema.safeParse(result.data);
  return out.success ? out.data.latest : undefined;
}

export async function readDeletionStatus(): Promise<AccountDeletionOutput | null | undefined> {
  const result = await signupFetch('/account/deletion', { method: 'GET' });
  if (result === null || !result.ok) return undefined;
  const out = accountDeletionStatusOutputSchema.safeParse(result.data);
  return out.success ? out.data.pending : undefined;
}
