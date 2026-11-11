// Site de démonstration local (lot 1.5dc) : charge `.demo/demo.env` puis lance `next dev`.
// `node --env-file` ne convient pas ici : Next relaie ses options à des processus enfants, qui le
// refusent dans NODE_OPTIONS.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.loadEnvFile(`${root}.demo/demo.env`);
if (process.env.APP_ENV !== 'local') {
  process.stderr.write('✖ Démonstration réservée au poste (APP_ENV=local).\n');
  process.exit(1);
}
process.chdir(`${root}apps/web`);
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.argv = [process.argv[0], 'next', 'dev', '--port', process.env.PORT ?? '3010'];
createRequire(`${root}apps/web/package.json`)('next/dist/bin/next');
