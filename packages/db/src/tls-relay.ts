import net from 'node:net';
import tls from 'node:tls';

/**
 * Relais local vers PostgreSQL en TLS épinglé (D-039). Le moteur de schéma de Prisma ne sait pas vérifier
 * une chaîne contre une autorité donnée sans vérifier aussi le nom d'hôte, absent du certificat Scaleway
 * (adresse privée) ; par défaut (`sslmode=require`), il accepte n'importe quel certificat. Les migrations
 * passent donc en clair par 127.0.0.1 jusqu'à ce relais, qui ouvre la connexion TLS vers la base et vérifie
 * la chaîne contre la seule autorité de l'instance, comme l'API (`pgConnectionOptions`, verify-ca).
 */
export interface TlsRelay {
  readonly port: number;
  /** Première erreur de connexion amont (certificat refusé, TLS non proposé…), pour le message final. */
  readonly lastError: () => Error | undefined;
  close(): Promise<void>;
}

// SSLRequest du protocole PostgreSQL : longueur 8, code 80877103.
const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);

export async function startTlsRelay(
  target: { readonly host: string; readonly port: number },
  caCert: string,
): Promise<TlsRelay> {
  let lastError: Error | undefined;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    sockets.add(client);
    client.pause();
    const upstream = net.connect(target.port, target.host);
    sockets.add(upstream);
    const abort = (error: Error): void => {
      lastError ??= error;
      client.destroy();
      upstream.destroy();
    };
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('error', abort);
    upstream.once('connect', () => upstream.write(SSL_REQUEST));
    upstream.once('data', (answer) => {
      // Un seul octet attendu : tout octet en plus aurait été injecté avant le chiffrement.
      if (answer.length !== 1 || answer[0] !== 0x53) {
        abort(new Error('la base ne propose pas TLS : connexion refusée'));
        return;
      }
      const secure = tls.connect({
        socket: upstream,
        ca: caCert,
        rejectUnauthorized: true,
        checkServerIdentity: () => undefined,
      });
      sockets.add(secure);
      secure.on('error', abort);
      secure.once('secureConnect', () => {
        client.pipe(secure).pipe(client);
        client.resume();
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as net.AddressInfo;

  return {
    port,
    lastError: () => lastError,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}
