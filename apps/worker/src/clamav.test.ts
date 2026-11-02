import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamavClient, ClamavError } from './clamav.js';

// Client clamd (lot 1.9b, tâche 3) face à un faux serveur TCP : protocole INSTREAM, délais, refus par défaut.

type Behaviour = (socket: Socket, received: () => Buffer) => void;

let server: Server | undefined;
const sockets = new Set<Socket>();

/** Faux clamd : accumule ce qu'il reçoit et laisse `behaviour` répondre. */
async function fakeClamd(behaviour: Behaviour): Promise<{ port: number; received: () => Buffer }> {
  let last = Buffer.alloc(0);
  server = createServer((socket) => {
    sockets.add(socket);
    let data = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      last = data;
    });
    socket.on('error', () => undefined);
    behaviour(socket, () => data);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, received: () => last };
}

/** Répond `reply` dès que la fin de flux (bloc de longueur 0) est reçue. */
const answerAtEnd =
  (reply: string): Behaviour =>
  (socket, received) => {
    socket.on('data', () => {
      if (received().subarray(-4).equals(Buffer.alloc(4))) socket.end(`${reply}\0`);
    });
  };

const client = (
  port: number,
  options: Partial<{ connectTimeoutMs: number; scanTimeoutMs: number; chunkBytes: number }> = {},
) => new ClamavClient({ host: '127.0.0.1', port, ...options });

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close(() => {
      resolve();
    });
    for (const socket of sockets) socket.destroy();
    sockets.clear();
  });
  server = undefined;
});

describe('INSTREAM', () => {
  it('envoie la commande, des blocs préfixés de leur longueur, puis un bloc vide', async () => {
    const { port, received } = await fakeClamd(answerAtEnd('stream: OK'));
    const data = Buffer.from('0123456789');
    expect(await client(port, { chunkBytes: 4 }).scan(data)).toEqual({ verdict: 'clean' });
    const length = (n: number) => Buffer.from([0, 0, 0, n]);
    expect(received()).toEqual(
      Buffer.concat([
        Buffer.from('zINSTREAM\0'),
        length(4),
        Buffer.from('0123'),
        length(4),
        Buffer.from('4567'),
        length(2),
        Buffer.from('89'),
        length(0),
      ]),
    );
  });

  it('infecté : nom de la signature', async () => {
    const { port } = await fakeClamd(answerAtEnd('stream: Eicar-Signature FOUND'));
    expect(await client(port).scan(Buffer.from('x'))).toEqual({
      verdict: 'infected',
      signature: 'Eicar-Signature',
    });
  });

  it('infecté : signature aux caractères inattendus assainie, jamais lue comme saine', async () => {
    const { port } = await fakeClamd(
      answerAtEnd(`stream: Win.Trojan/Agent {x}<b> ${'y'.repeat(300)} FOUND`),
    );
    const result = await client(port).scan(Buffer.from('x'));
    expect(result.verdict).toBe('infected');
    if (result.verdict !== 'infected') return;
    expect(result.signature).toMatch(/^[A-Za-z0-9._:-]{1,200}$/);
    expect(result.signature.startsWith('Win.Trojan_Agent')).toBe(true);
  });

  it('gros fichier (16 Mo) : envoi complet malgré la contre-pression', async () => {
    const { port, received } = await fakeClamd(answerAtEnd('stream: OK'));
    const data = Buffer.alloc(16 * 1024 * 1024, 7);
    expect(await client(port).scan(data)).toEqual({ verdict: 'clean' });
    // Commande + 256 blocs de 64 Kio (4 + 65 536 octets) + bloc de fin.
    expect(received().byteLength).toBe(10 + 256 * (4 + 65_536) + 4);
  });

  it('un fichier vide est analysé (bloc vide seul)', async () => {
    const { port, received } = await fakeClamd(answerAtEnd('stream: OK'));
    expect(await client(port).scan(new Uint8Array())).toEqual({ verdict: 'clean' });
    expect(received()).toEqual(Buffer.concat([Buffer.from('zINSTREAM\0'), Buffer.alloc(4)]));
  });

  it.each([
    ['ERROR', 'INSTREAM size limit exceeded. ERROR'],
    ['ERROR de lecture', "stream: Can't allocate memory ERROR"],
    ['réponse inattendue', 'stream: PEUT-ÊTRE'],
    ['réponse vide', ''],
    ['autre flux', 'fd[10]: OK'],
  ])('%s → ClamavError, jamais `clean`', async (_label, reply) => {
    const { port } = await fakeClamd(answerAtEnd(reply));
    await expect(client(port).scan(Buffer.from('x'))).rejects.toBeInstanceOf(ClamavError);
  });

  it('réponse avant la fin de l’envoi (limite de taille) : rejet ClamavError', async () => {
    const { port } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.end('INSTREAM size limit exceeded. ERROR\0');
      });
    });
    await expect(
      client(port, { chunkBytes: 1024 }).scan(Buffer.alloc(4 * 1024 * 1024)),
    ).rejects.toBeInstanceOf(ClamavError);
  });

  it('`stream: OK` anticipé (fichier pas entièrement envoyé) : jamais `clean`', async () => {
    const { port } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.end('stream: OK\0');
      });
    });
    await expect(
      client(port, { chunkBytes: 1024 }).scan(Buffer.alloc(8 * 1024 * 1024)),
    ).rejects.toBeInstanceOf(ClamavError);
  });

  it.each([
    ['espaces autour', ' \n\tstream: OK \r\n'],
    ['seconde réponse après le terminateur', 'stream: OK\0stream: X FOUND'],
    ['octets après le terminateur', 'stream: OK\0x'],
  ])('réponse non exacte (%s) : refusée', async (_label, reply) => {
    const { port } = await fakeClamd(answerAtEnd(reply));
    await expect(client(port).scan(Buffer.from('x'))).rejects.toBeInstanceOf(ClamavError);
  });

  it('réponse découpée en plusieurs paquets : recomposée', async () => {
    const { port } = await fakeClamd((socket, received) => {
      socket.on('data', () => {
        if (!received().subarray(-4).equals(Buffer.alloc(4))) return;
        socket.write('stream: Eicar');
        setTimeout(() => socket.end('-Signature FOUND\0'), 20);
      });
    });
    expect(await client(port).scan(Buffer.from('x'))).toEqual({
      verdict: 'infected',
      signature: 'Eicar-Signature',
    });
  });

  it('cause de l’échec typée : rejected, unexpected, unavailable, timeout', async () => {
    const reason = async (promise: Promise<unknown>): Promise<unknown> =>
      ((await promise.catch((error: unknown) => error)) as ClamavError).reason;
    const rejected = await fakeClamd(answerAtEnd("stream: Can't allocate memory ERROR"));
    expect(await reason(client(rejected.port).scan(Buffer.from('x')))).toBe('rejected');
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    for (const socket of sockets) socket.destroy();
    const odd = await fakeClamd(answerAtEnd('stream: PEUT-ÊTRE'));
    expect(await reason(client(odd.port).scan(Buffer.from('x')))).toBe('unexpected');
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    for (const socket of sockets) socket.destroy();
    const silent = await fakeClamd(() => undefined);
    expect(await reason(client(silent.port, { scanTimeoutMs: 100 }).scan(Buffer.from('x')))).toBe(
      'timeout',
    );
    expect(
      await reason(new ClamavClient({ host: '127.0.0.1', port: 1 }).scan(Buffer.from('x'))),
    ).toBe('unavailable');
  });

  it('contenu > 50 Mo : refusé sans connexion', async () => {
    const unreachable = new ClamavClient({ host: '127.0.0.1', port: 1 });
    await expect(unreachable.scan(new Uint8Array(52_428_801))).rejects.toMatchObject({
      reason: 'rejected',
    });
  });

  it('connexion fermée sans réponse : ClamavError', async () => {
    const { port } = await fakeClamd((socket, received) => {
      socket.on('data', () => {
        if (received().subarray(-4).equals(Buffer.alloc(4))) socket.end();
      });
    });
    await expect(client(port).scan(Buffer.from('x'))).rejects.toThrow(/sans réponse/);
  });

  it('réponse sans terminateur (tronquée) : refusée même si elle dit OK', async () => {
    const { port } = await fakeClamd((socket, received) => {
      socket.on('data', () => {
        if (received().subarray(-4).equals(Buffer.alloc(4))) socket.end('stream: OK');
      });
    });
    await expect(client(port).scan(Buffer.from('x'))).rejects.toThrow(/sans réponse/);
  });

  it('connexion coupée brutalement : ClamavError', async () => {
    const { port } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.resetAndDestroy();
      });
    });
    await expect(client(port).scan(Buffer.from('x'))).rejects.toBeInstanceOf(ClamavError);
  });

  it('réponse démesurée (> 1 Kio) : ClamavError', async () => {
    const { port } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.write('A'.repeat(2048));
      });
    });
    await expect(client(port).scan(Buffer.from('x'))).rejects.toThrow(/démesurée/);
  });

  it('analyse trop longue : ClamavError après le délai', async () => {
    const { port } = await fakeClamd(() => undefined);
    const started = Date.now();
    await expect(client(port, { scanTimeoutMs: 200 }).scan(Buffer.from('x'))).rejects.toThrow(
      /délai d’analyse/,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('serveur injoignable : ClamavError', async () => {
    const { port } = await fakeClamd(() => undefined);
    await new Promise<void>((resolve) =>
      server?.close(() => {
        resolve();
      }),
    );
    server = undefined;
    await expect(client(port).scan(Buffer.from('x'))).rejects.toThrow(/injoignable/);
  });

  it('connexion qui n’aboutit pas : ClamavError après le délai de connexion', async () => {
    // Adresse non routable (TEST-NET-1, RFC 5737) : la connexion reste en attente.
    const unreachable = new ClamavClient({ host: '192.0.2.1', port: 3310, connectTimeoutMs: 100 });
    await expect(unreachable.scan(Buffer.from('x'))).rejects.toThrow(/délai de connexion/);
  });
});

describe('PING', () => {
  it('PONG → true', async () => {
    const { port, received } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.end('PONG\0');
      });
    });
    expect(await client(port).ping()).toBe(true);
    expect(received()).toEqual(Buffer.from('zPING\0'));
  });

  it('autre réponse ou panne → false', async () => {
    const { port } = await fakeClamd((socket) => {
      socket.once('data', () => {
        socket.end('NON\0');
      });
    });
    expect(await client(port).ping()).toBe(false);
    expect(await new ClamavClient({ host: '127.0.0.1', port: 1 }).ping()).toBe(false);
  });
});

describe('paramètres', () => {
  it.each([
    [{ port: 0 }],
    [{ port: 65_536 }],
    [{ connectTimeoutMs: 0 }],
    [{ scanTimeoutMs: -1 }],
    [{ chunkBytes: 0 }],
    [{ chunkBytes: 1_048_577 }],
    [{ host: '' }],
  ])('refuse %j', (override) => {
    expect(() => new ClamavClient({ host: '127.0.0.1', port: 3310, ...override })).toThrow(
      RangeError,
    );
  });
});
