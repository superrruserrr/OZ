/** Schéma Prisma, migrations, seeds (lot 0.6) */
export const PACKAGE_NAME = '@oz/db' as const;
export { createDbClient, type PrismaClient } from './client.js';
export { withUserContext, type TransactionClient } from './session-context.js';
export { issueOzId, type IssuedOzId } from './oz-id.js';
export {
  credentialsFor,
  registerUser,
  rehashPassword,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  type AccountCredentials,
  type AccountStatus,
  type AuthSqlClient,
} from './auth.js';
export {
  accountEmail,
  listSessions,
  logoutSession,
  openSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  sessionAccess,
  type OpenedSession,
  type RotationResult,
  type SessionAccess,
  type SessionRole,
  type SessionStatus,
  type SessionSummary,
} from './sessions.js';
export {
  beginTotp,
  consumeRecoveryCode,
  consumeTotpStep,
  disableTotp,
  enableTotp,
  replaceRecoveryCodes,
  totpState,
  type TotpDisableOutcome,
  type TotpState,
} from './totp.js';
export { setVerifiedPhone, type PhoneOutcome } from './phone.js';
export {
  completeDocumentUpload,
  createDocumentUpload,
  documentTargetFor,
  documentUploadFor,
  rejectDocumentUpload,
  type CompleteOutcome,
  type DocumentTargetRecord,
  type DocumentUploadRow,
  type NewDocumentUpload,
  type RejectReason,
  type UploadDocumentType,
  type UploadTarget,
} from './document-uploads.js';
export { readableDocumentFor, recordDocumentRead, type ReadableDocument } from './document-read.js';
export {
  claimDocumentScan,
  finishDocumentScan,
  type ClaimedDocument,
  type ScanRejectionReason,
  type ScanVerdict,
} from './document-scan.js';
export { playerRecord, type PlayerAccessRecord } from './players.js';
export { readSetting } from './settings.js';
