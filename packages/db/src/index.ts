/** Schéma Prisma, migrations, seeds (lot 0.6) */
export const PACKAGE_NAME = '@oz/db' as const;
export { createDbClient, type PrismaClient } from './client.js';
export { withUserContext, type TransactionClient } from './session-context.js';
export { issueOzId, type IssuedOzId } from './oz-id.js';
