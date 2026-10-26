import { rollbackLast } from '../rollback.js';
import { commandEnvironment, fail } from './environment.js';

// pnpm db:rollback [-- --confirm-production]
try {
  const { rolledBack } = await rollbackLast({
    ...commandEnvironment(),
    confirmProduction: process.argv.includes('--confirm-production'),
  });
  process.stdout.write(
    rolledBack ? `✓ Migration annulée : ${rolledBack}\n` : 'Aucune migration appliquée.\n',
  );
} catch (error) {
  fail(error);
}
