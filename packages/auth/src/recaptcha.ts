// reCAPTCHA v3, vérification côté serveur (lot 1.3ca, D4). Ne lève jamais : une panne renvoie
// « unavailable », que l'appelant traite (inscription acceptée et journalisée, comme HIBP en 1.3a).
// L'IP du client n'est pas transmise à Google (`remoteip` facultatif) ; le secret ne figure dans
// aucun verdict.

export type RecaptchaVerdict =
  | { readonly verdict: 'human'; readonly score: number }
  | {
      readonly verdict: 'bot';
      readonly reason: 'missing' | 'rejected' | 'score' | 'action' | 'hostname';
    }
  | { readonly verdict: 'unavailable'; readonly cause?: 'configuration' };

/** Sous-ensemble de `fetch` utilisé : injectable en test. */
export type RecaptchaFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export interface RecaptchaVerifierOptions {
  readonly secret: string;
  /** Score minimal d'un humain, entre 0 et 1 (`RECAPTCHA_MIN_SCORE`). */
  readonly minScore: number;
  /** Noms d'hôte où le formulaire est servi (`APP_URL`). */
  readonly hostnames: readonly string[];
  readonly action?: string;
  readonly fetch?: RecaptchaFetch;
  readonly timeoutMs?: number;
}

export const RECAPTCHA_DEFAULT_TIMEOUT_MS = 3_000;
const ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';
/** Une réponse réelle fait moins de 300 octets. */
const MAX_BODY_CHARS = 10_000;
/** Refus dus à notre configuration (secret absent ou faux) : panne, pas robot. */
const CONFIG_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret', 'bad-request']);

interface SiteverifyResponse {
  readonly success?: unknown;
  readonly score?: unknown;
  readonly action?: unknown;
  readonly hostname?: unknown;
  readonly 'error-codes'?: unknown;
}

export class RecaptchaVerifier {
  private readonly fetch: RecaptchaFetch;
  private readonly timeoutMs: number;
  private readonly action: string;
  private readonly hostnames: ReadonlySet<string>;

  constructor(private readonly options: RecaptchaVerifierOptions) {
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? RECAPTCHA_DEFAULT_TIMEOUT_MS;
    this.action = options.action ?? 'register';
    this.hostnames = new Set(options.hostnames.map((host) => host.toLowerCase()));
  }

  async verify(token: string | undefined): Promise<RecaptchaVerdict> {
    if (token === undefined || token === '') return { verdict: 'bot', reason: 'missing' };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Le délai couvre tout l'appel, lecture du corps comprise, quel que soit le `fetch` utilisé.
    const deadline = new Promise<RecaptchaVerdict>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(new Error('délai reCAPTCHA dépassé'));
        resolve({ verdict: 'unavailable' });
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.query(token, controller.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async query(token: string, signal: AbortSignal): Promise<RecaptchaVerdict> {
    try {
      const response = await this.fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.options.secret, response: token }).toString(),
        signal,
      });
      if (!response.ok) return { verdict: 'unavailable' };
      const text = await response.text();
      if (text.length > MAX_BODY_CHARS) return { verdict: 'unavailable' };
      return this.judge(JSON.parse(text) as unknown);
    } catch {
      // Réseau, abandon, JSON illisible : le message d'erreur n'est ni conservé ni renvoyé.
      return { verdict: 'unavailable' };
    }
  }

  private judge(parsed: unknown): RecaptchaVerdict {
    if (typeof parsed !== 'object' || parsed === null) return { verdict: 'unavailable' };
    const body = parsed as SiteverifyResponse;
    if (body.success !== true) {
      // Refus sans code d'erreur : réponse inattendue (portail, proxy), pas un verdict.
      if (!Array.isArray(body['error-codes'])) return { verdict: 'unavailable' };
      const codes = body['error-codes'] as unknown[];
      const ours = codes.some((code) => typeof code === 'string' && CONFIG_ERRORS.has(code));
      return ours
        ? { verdict: 'unavailable', cause: 'configuration' }
        : { verdict: 'bot', reason: 'rejected' };
    }
    if (typeof body.score !== 'number' || typeof body.action !== 'string') {
      // Réponse v2 ou tronquée : on ne sait pas juger.
      return { verdict: 'unavailable' };
    }
    if (body.action !== this.action) return { verdict: 'bot', reason: 'action' };
    const host = typeof body.hostname === 'string' ? body.hostname.toLowerCase() : '';
    if (!this.hostnames.has(host)) return { verdict: 'bot', reason: 'hostname' };
    if (body.score < this.options.minScore) return { verdict: 'bot', reason: 'score' };
    return { verdict: 'human', score: body.score };
  }
}
