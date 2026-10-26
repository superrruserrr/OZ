import { anonymizeDatabase } from '../anonymize/anonymize.js';
import { commandEnvironment, fail, option } from './environment.js';

// pnpm --filter @oz/db db:anonymize -- --target-host=<serveur> --target-port=<port> --target-db=<base>
try {
  const targetHost = option('target-host');
  const targetPort = Number(option('target-port'));
  const targetDb = option('target-db');
  if (!targetHost || !targetDb || !Number.isInteger(targetPort) || targetPort <= 0) {
    throw new Error(
      'Préciser la cible complète : --target-host=<serveur> --target-port=<port> --target-db=<base>.',
    );
  }
  const { rows } = await anonymizeDatabase({
    ...commandEnvironment(),
    targetHost,
    targetPort,
    targetDb,
  });
  process.stdout.write(
    `✓ ${String(rows)} lignes anonymisées dans ${targetHost}:${String(targetPort)}/${targetDb}.\n`,
  );
} catch (error) {
  fail(error);
}
