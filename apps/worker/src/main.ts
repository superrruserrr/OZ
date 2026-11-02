import { runMain, serve } from './worker.js';

// Point d'entrée du conteneur (`node dist/main.js`) ; la logique vit dans `worker.ts`, testée.

const code = await runMain(process.env, {
  stderr: (text) => process.stderr.write(text),
  start: (config) => serve(config, process),
});
if (code !== 0) process.exit(code);
