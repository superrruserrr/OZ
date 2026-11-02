import type { SmsFailureCode } from './provider.js';

/** Sous-ensemble de `fetch` utilisé : injectable en test. */
export type SmsFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export const SMS_DEFAULT_TIMEOUT_MS = 5_000;
/** Une réponse réelle fait quelques centaines d'octets. */
const MAX_BODY_CHARS = 100_000;

export type SmsHttpResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly code: SmsFailureCode };

export interface SmsHttpOptions {
  readonly fetch?: SmsFetch;
  readonly timeoutMs?: number;
}

/** POST borné : le délai couvre tout l'appel, lecture du corps comprise. Ne lève jamais. */
export async function postBounded(
  url: string,
  headers: Record<string, string>,
  body: string,
  options: SmsHttpOptions,
): Promise<SmsHttpResult> {
  const fetch: SmsFetch = options.fetch ?? ((target, init) => globalThis.fetch(target, init));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SmsHttpResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new Error('délai SMS dépassé'));
      resolve({ ok: false, code: 'timeout' });
    }, options.timeoutMs ?? SMS_DEFAULT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([query(fetch, url, headers, body, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function query(
  fetch: SmsFetch,
  url: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
): Promise<SmsHttpResult> {
  try {
    const response = await fetch(url, { method: 'POST', headers, body, signal });
    if (!response.ok) {
      return { ok: false, code: response.status < 500 ? 'http_4xx' : 'http_5xx' };
    }
    const text = await response.text();
    if (text.length > MAX_BODY_CHARS) return { ok: false, code: 'invalid_response' };
    return { ok: true, body: text };
  } catch {
    // Le message d'erreur peut citer l'adresse ou le numéro : il n'est ni conservé ni renvoyé.
    return { ok: false, code: 'network' };
  }
}
