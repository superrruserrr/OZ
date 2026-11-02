import { connect, type Socket } from 'node:net';

// Client clamd (lot 1.9b, D7, D8) : protocole INSTREAM sur TCP, sans dépendance. Refus par défaut :
// seule la réponse exacte `stream: OK` vaut `clean` ; tout le reste est `infected` ou une erreur.

export type ClamavVerdict =
  { readonly verdict: 'clean' } | { readonly verdict: 'infected'; readonly signature: string };

export interface ClamavOptions {
  readonly host: string;
  readonly port: number;
  /** Délai pour ouvrir la connexion (5 s par défaut). */
  readonly connectTimeoutMs?: number;
  /** Délai total de l'analyse, connexion comprise (60 s par défaut). */
  readonly scanTimeoutMs?: number;
  /** Taille des blocs envoyés (64 Kio par défaut). */
  readonly chunkBytes?: number;
}

/**
 * Cause d'un échec d'analyse : `rejected` (clamd a répondu ERROR, taille comprise), `unexpected`
 * (réponse illisible ou incomplète), `unavailable` (injoignable, coupure), `timeout`.
 */
export type ClamavFailure = 'rejected' | 'unexpected' | 'unavailable' | 'timeout';

/** Analyse impossible : aucun verdict fiable. Jamais lue comme `clean`. */
export class ClamavError extends Error {
  override readonly name = 'ClamavError';

  constructor(
    readonly reason: ClamavFailure,
    message: string,
  ) {
    super(message);
  }
}

/** Borne du dépôt (50 Mo) : au-delà, rien n'est envoyé. */
const MAX_SCAN_BYTES = 52_428_800;
/** Une réponse de clamd tient en une ligne ; au-delà, ce n'est pas clamd. */
const MAX_REPLY_BYTES = 1024;
const FOUND = /^stream: (.+) FOUND$/;

const positiveInteger = (value: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isInteger(value) && value >= 1 && value <= max;

/** Nom de signature réduit aux caractères admis par le journal (≤ 200) ; jamais vide (`.+`). */
const safeSignature = (raw: string): string => raw.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 200);

export class ClamavClient {
  private readonly host: string;
  private readonly port: number;
  private readonly connectTimeoutMs: number;
  private readonly scanTimeoutMs: number;
  private readonly chunkBytes: number;

  constructor(options: ClamavOptions) {
    this.host = options.host;
    this.port = options.port;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.scanTimeoutMs = options.scanTimeoutMs ?? 60_000;
    this.chunkBytes = options.chunkBytes ?? 65_536;
    if (
      this.host.length === 0 ||
      !positiveInteger(this.port, 65_535) ||
      !positiveInteger(this.connectTimeoutMs) ||
      !positiveInteger(this.scanTimeoutMs) ||
      !positiveInteger(this.chunkBytes, 1_048_576)
    ) {
      throw new RangeError('ClamAV : paramètres de connexion invalides');
    }
  }

  /** `true` si clamd répond `PONG` ; jamais d'exception (sonde de santé). */
  async ping(): Promise<boolean> {
    try {
      const { reply } = await this.exchange([Buffer.from('zPING\0')]);
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  /** Analyse le contenu entier ; `ClamavError` si aucun verdict fiable n'est obtenu. */
  async scan(data: Uint8Array): Promise<ClamavVerdict> {
    if (data.byteLength > MAX_SCAN_BYTES) {
      throw new ClamavError('rejected', 'ClamAV : contenu au-delà de 50 Mo');
    }
    const frames: Buffer[] = [Buffer.from('zINSTREAM\0')];
    for (let offset = 0; offset < data.byteLength; offset += this.chunkBytes) {
      const chunk = data.subarray(offset, offset + this.chunkBytes);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(chunk.byteLength);
      frames.push(length, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    }
    frames.push(Buffer.alloc(4));
    const { reply, complete } = await this.exchange(frames);
    // `OK` ne vaut que pour le fichier entier : une réponse anticipée n'a pas tout vu.
    if (reply === 'stream: OK' && complete) return { verdict: 'clean' };
    const found = FOUND.exec(reply);
    if (found?.[1] !== undefined)
      return { verdict: 'infected', signature: safeSignature(found[1]) };
    if (reply.endsWith(' ERROR')) throw new ClamavError('rejected', 'ClamAV : erreur d’analyse');
    throw new ClamavError('unexpected', 'ClamAV : réponse inattendue');
  }

  /**
   * Envoie les trames et rend la réponse exacte (sans le `\0` final) une fois la connexion fermée
   * par clamd, et si toutes les trames sont parties. Une seule réponse admise, rien après le `\0`.
   */
  private exchange(frames: readonly Buffer[]): Promise<{ reply: string; complete: boolean }> {
    return new Promise((resolve, reject) => {
      let received = Buffer.alloc(0);
      let complete = false;
      let settled = false;
      const socket: Socket = connect({ host: this.host, port: this.port });
      // Idempotent : seul le premier dénouement compte (réponse, erreur, délai ou fermeture).
      const fail = (reason: ClamavFailure, message: string): void => {
        if (settled) return;
        settle();
        reject(new ClamavError(reason, message));
      };
      const settle = (): void => {
        settled = true;
        clearTimeout(connectTimer);
        clearTimeout(scanTimer);
        socket.destroy();
      };
      const connectTimer = setTimeout(() => {
        fail('timeout', 'ClamAV : délai de connexion dépassé');
      }, this.connectTimeoutMs);
      const scanTimer = setTimeout(() => {
        fail('timeout', 'ClamAV : délai d’analyse dépassé');
      }, this.scanTimeoutMs);

      // Envoi bloc par bloc ; contre-pression : on reprend au `drain`, qu'un socket détruit au
      // dénouement n'émet plus.
      const send = (from: number): void => {
        for (let index = from; index < frames.length; index += 1) {
          if (!socket.write(frames[index] as Buffer)) {
            socket.once('drain', () => {
              send(index + 1);
            });
            return;
          }
        }
        complete = true;
      };
      socket.once('connect', () => {
        clearTimeout(connectTimer);
        send(0);
      });
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.byteLength > MAX_REPLY_BYTES) fail('unexpected', 'ClamAV : réponse démesurée');
      });
      socket.on('end', () => {
        // Exactement une réponse terminée par `\0` : ni tronquée, ni suivie d'autre chose.
        const end = received.indexOf(0);
        if (end < 0 || end !== received.byteLength - 1) {
          fail('unexpected', 'ClamAV : connexion fermée sans réponse complète');
          return;
        }
        // Promesse déjà dénouée (délai) : `resolve` est alors sans effet.
        const reply = received.subarray(0, end).toString('utf8');
        settle();
        resolve({ reply, complete });
      });
      socket.on('error', (error: NodeJS.ErrnoException) => {
        fail(
          'unavailable',
          error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND'
            ? 'ClamAV : injoignable'
            : 'ClamAV : échange interrompu',
        );
      });
      socket.on('close', () => {
        fail('unavailable', 'ClamAV : connexion fermée sans réponse');
      });
    });
  }
}
