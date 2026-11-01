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
  type SessionSummary,
} from './sessions.js';
export { readSetting } from './settings.js';
