import net from 'node:net';

/** Proxy TCP local qu'on peut « geler » : les octets cessent de circuler sans fermer les connexions. */
export interface StallableProxy {
  readonly port: number;
  stall(): void;
  resume(): void;
  close(): Promise<void>;
}

export async function startProxy(targetHost: string, targetPort: number): Promise<StallableProxy> {
  let stalled = false;
  const sockets = new Set<net.Socket>();
  const pairs = new Set<[net.Socket, net.Socket]>();

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    sockets.add(client).add(upstream);
    const pair: [net.Socket, net.Socket] = [client, upstream];
    pairs.add(pair);
    const forward = (from: net.Socket, to: net.Socket): void => {
      from.on('data', (chunk: Buffer) => {
        if (!stalled) to.write(chunk);
      });
    };
    forward(client, upstream);
    forward(upstream, client);
    const cleanup = (): void => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
      pairs.delete(pair);
    };
    client.on('error', cleanup).on('close', cleanup);
    upstream.on('error', cleanup).on('close', cleanup);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('adresse du proxy inconnue');

  return {
    port: address.port,
    stall: () => {
      stalled = true;
    },
    resume: () => {
      stalled = false;
      // Les connexions gelées ont perdu des octets : on les coupe, les clients se reconnecteront.
      for (const [client, upstream] of pairs) {
        client.destroy();
        upstream.destroy();
      }
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    },
  };
}
