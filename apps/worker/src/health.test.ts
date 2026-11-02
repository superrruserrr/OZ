import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startHealthServer, type HealthServer } from './health.js';

// Sonde de vivacité du worker (lot 1.9b, tâche 7) : contrôle de santé de l'image, boucle locale seule.

let server: HealthServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const url = (path: string): string =>
  `http://127.0.0.1:${String((server?.address() as AddressInfo).port)}${path}`;

describe('startHealthServer', () => {
  it('worker actif : 200 sur /health/live, sans corps', async () => {
    server = await startHealthServer(() => true, 0);
    const response = await fetch(url('/health/live'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('worker arrêté ou Redis perdu : 503', async () => {
    server = await startHealthServer(() => false, 0);
    expect((await fetch(url('/health/live'))).status).toBe(503);
  });

  it('autre chemin ou méthode : 404', async () => {
    server = await startHealthServer(() => true, 0);
    expect((await fetch(url('/'))).status).toBe(404);
    expect((await fetch(url('/health/live'), { method: 'POST' })).status).toBe(404);
  });

  it('n’écoute que sur la boucle locale', async () => {
    server = await startHealthServer(() => true, 0);
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});
