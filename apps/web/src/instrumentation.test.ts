// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('register (démarrage du serveur, D-021)', () => {
  it('arrête le processus Node : Next se contente sinon de journaliser l’erreur', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('APP_ENV', 'prod');
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(stderr.mock.calls[0]?.[0])).toMatch(/APP_ENV/);
    exit.mockRestore();
    stderr.mockRestore();
  });

  it('refuse un build de production sans APP_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', undefined);
    await expect(register()).rejects.toThrow(/APP_ENV/);
  });

  it('refuse un APP_ENV inconnu', async () => {
    vi.stubEnv('APP_ENV', 'prod');
    await expect(register()).rejects.toThrow(/APP_ENV/);
  });

  it('démarre avec un APP_ENV valide', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'preview');
    await expect(register()).resolves.toBeUndefined();
  });
});
