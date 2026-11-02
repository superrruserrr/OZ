import { createServer, type Server } from 'node:http';

// Sonde de vivacité du worker (lot 1.9b) pour le HEALTHCHECK de l'image : le worker n'expose aucun
// service, la sonde n'écoute que sur 127.0.0.1 (jamais publiée hors du conteneur).

/** Port de la sonde dans le conteneur (`infra/docker/images/worker.Dockerfile`). */
export const HEALTH_PORT = 3003;

export interface HealthServer {
  address: Server['address'];
  close(): Promise<void>;
}

/** `GET /health/live` : 200 si `healthy()` (worker actif, Redis connecté), sinon 503. */
export async function startHealthServer(
  healthy: () => boolean,
  port: number,
): Promise<HealthServer> {
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health/live') {
      response.writeHead(healthy() ? 200 : 503).end();
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    address: () => server.address(),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
