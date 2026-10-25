import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadApiConfig, type ApiConfig } from '@oz/config';
import { createApp } from './app.js';

interface MainIo {
  readonly stderr: (text: string) => void;
  readonly start: (config: ApiConfig) => Promise<void>;
}

/** Valide la configuration puis démarre ; renvoie un code de sortie non nul au lieu de démarrer mal configuré. */
export async function runMain(
  env: Readonly<Record<string, string | undefined>>,
  io: MainIo,
): Promise<number> {
  let config: ApiConfig;
  try {
    config = loadApiConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr(`✖ ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  await io.start(config);
  return 0;
}

async function listen(config: ApiConfig): Promise<void> {
  const app = await createApp(config);
  await app.listen(config.apiPort);
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const code = await runMain(process.env, {
    stderr: (text) => process.stderr.write(text),
    start: listen,
  });
  if (code !== 0) process.exit(code);
}
