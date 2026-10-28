import { createHash } from 'node:crypto';
import { normalizePassword } from './password-policy.js';

export type PwnedResult = 'breached' | 'clean' | 'unavailable';

/** Sous-ensemble de `fetch` utilisé : injectable en test. */
export type FetchLike = (
  url: string,
  init: { readonly headers: Record<string, string>; readonly signal: AbortSignal },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export interface PwnedClientOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly endpoint?: string;
}

export const PWNED_DEFAULT_TIMEOUT_MS = 1_500;
/** Une vraie réponse (avec remplissage) fait de 800 à 1 000 lignes de 40 octets environ. */
const MAX_BODY_CHARS = 200_000;
const RANGE_LINE = /^[0-9A-F]{35}:[0-9]+$/i;
const DEFAULT_ENDPOINT = 'https://api.pwnedpasswords.com';

/**
 * Vérification HaveIBeenPwned par k-anonymité (EX-103 n° 2) : seuls les 5 premiers caractères de
 * l'empreinte SHA-1 quittent le serveur, avec remplissage de la réponse. Ne lève jamais : une panne
 * ou un délai dépassé renvoie « indisponible », que l'appelant traite (décision D1 du lot 1.3a).
 */
export class PwnedPasswordsClient {
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: PwnedClientOptions = {}) {
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? PWNED_DEFAULT_TIMEOUT_MS;
    this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '');
  }

  async check(password: string): Promise<PwnedResult> {
    const digest = createHash('sha1')
      .update(normalizePassword(password), 'utf8')
      .digest('hex')
      .toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Le délai couvre tout l'appel, lecture du corps comprise, quel que soit le `fetch` utilisé.
    const deadline = new Promise<PwnedResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(new Error('délai HaveIBeenPwned dépassé'));
        resolve('unavailable');
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.query(prefix, suffix, controller.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async query(prefix: string, suffix: string, signal: AbortSignal): Promise<PwnedResult> {
    try {
      const response = await this.fetch(`${this.endpoint}/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'OZ-auth' },
        signal,
      });
      if (!response.ok) return 'unavailable';
      const body = await response.text();
      if (body.length > MAX_BODY_CHARS) return 'unavailable';
      const lines = body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      // Corps vide ou illisible (portail captif, page d'erreur) : panne, pas « non compromis ».
      if (lines.length === 0 || !lines.every((line) => RANGE_LINE.test(line))) return 'unavailable';
      for (const line of lines) {
        const [candidate = '', count = '0'] = line.split(':');
        if (candidate.toUpperCase() === suffix && Number(count) > 0) return 'breached';
      }
      return 'clean';
    } catch {
      return 'unavailable';
    }
  }
}
