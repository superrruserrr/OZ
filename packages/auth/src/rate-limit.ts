// Limitation de débit (lot 1.3ca, EX-T18) : règles, valeurs par défaut, réglage et fenêtre glissante.
// Le décompte vit dans Redis (`SLIDING_LOG_SCRIPT`) ; `slidingLogDecision` en est le modèle exact,
// vérifié par propriété.

/** Règles connues : une par route et par clé (IP, compte, adresse). */
export const RATE_LIMIT_RULES = [
  'login_ip',
  'login_account',
  'login_totp_ip',
  'login_totp_account',
  'totp_setup_ip',
  'totp_enroll_account',
  'otp_start_ip',
  'otp_start_account',
  'otp_start_phone',
  'otp_verify_ip',
  'otp_verify_account',
  'register_ip',
  'register_email',
  'register_form_ip',
  'forgot_ip',
  'forgot_email',
  'verify_email_ip',
  'reset_ip',
  'refresh_ip',
  'new_device_email',
  'document_upload_account',
  'document_complete_account',
  'document_read_account',
  'audit_log_read_account',
  'player_profile_read_account',
  'player_visibility_update_account',
  'data_export_request_account',
] as const;

export type RateLimitRule = (typeof RATE_LIMIT_RULES)[number];

export interface RateLimit {
  /** Passages autorisés dans la fenêtre. */
  readonly limit: number;
  /** Durée de la fenêtre glissante, en secondes. */
  readonly windowSeconds: number;
}

export type RateLimits = Readonly<Record<RateLimitRule, RateLimit>>;

const HOUR = 3600;

/** Valeurs de départ du §6.6 et de la décision D7, à ajuster sous observation (EX-T18). */
export const RATE_LIMIT_DEFAULTS: RateLimits = Object.freeze({
  login_ip: { limit: 5, windowSeconds: 15 * 60 },
  login_account: { limit: 10, windowSeconds: HOUR },
  login_totp_ip: { limit: 10, windowSeconds: 15 * 60 },
  login_totp_account: { limit: 5, windowSeconds: 15 * 60 },
  totp_setup_ip: { limit: 10, windowSeconds: HOUR },
  totp_enroll_account: { limit: 10, windowSeconds: HOUR },
  otp_start_ip: { limit: 10, windowSeconds: HOUR },
  otp_start_account: { limit: 3, windowSeconds: 15 * 60 },
  otp_start_phone: { limit: 5, windowSeconds: 24 * HOUR },
  otp_verify_ip: { limit: 20, windowSeconds: 15 * 60 },
  otp_verify_account: { limit: 10, windowSeconds: HOUR },
  register_ip: { limit: 3, windowSeconds: HOUR },
  register_email: { limit: 1, windowSeconds: HOUR },
  register_form_ip: { limit: 20, windowSeconds: HOUR },
  forgot_ip: { limit: 3, windowSeconds: HOUR },
  forgot_email: { limit: 1, windowSeconds: 15 * 60 },
  verify_email_ip: { limit: 10, windowSeconds: HOUR },
  reset_ip: { limit: 10, windowSeconds: HOUR },
  refresh_ip: { limit: 60, windowSeconds: 60 },
  new_device_email: { limit: 3, windowSeconds: 24 * HOUR },
  // Intentions de dépôt de documents (lot 1.9a) : par compte, une URL signée chacune.
  document_upload_account: { limit: 20, windowSeconds: HOUR },
  // Réceptions : nouvel essai après 409 ou 503 compris, mais pas de quoi saturer les connexions.
  document_complete_account: { limit: 60, windowSeconds: HOUR },
  // URL de lecture (lot 1.9ca) : une consultation de dossier en demande plusieurs, jamais des milliers.
  document_read_account: { limit: 120, windowSeconds: HOUR },
  // Journal d'audit (lot 1.16a) : une enquête feuillette des pages, une aspiration en enchaîne des milliers.
  audit_log_read_account: { limit: 600, windowSeconds: HOUR },
  // Fiche joueur (lot 1.13a) : une recherche en ouvre des dizaines, un aspirateur des milliers.
  player_profile_read_account: { limit: 300, windowSeconds: HOUR },
  // Réglage de visibilité (lot 1.13a) : quelques changements, jamais une rafale.
  player_visibility_update_account: { limit: 30, windowSeconds: HOUR },
  // Demande d'export (lot 1.16ba) : ré-authentification par mot de passe, quelques essais seulement.
  data_export_request_account: { limit: 10, windowSeconds: HOUR },
});

// Borne la taille d'un journal dans Redis (un membre par passage accepté).
const MAX_LIMIT = 1_000;
const MAX_WINDOW_SECONDS = 7 * 24 * HOUR;

const isRule = (name: string): name is RateLimitRule =>
  (RATE_LIMIT_RULES as readonly string[]).includes(name);

const isBoundedInteger = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

function parseRateLimit(value: unknown): RateLimit | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort();
  if (keys.length !== 2 || keys[0] !== 'limit' || keys[1] !== 'windowSeconds') return null;
  if (!isBoundedInteger(entry.limit, MAX_LIMIT)) return null;
  if (!isBoundedInteger(entry.windowSeconds, MAX_WINDOW_SECONDS)) return null;
  return { limit: entry.limit, windowSeconds: entry.windowSeconds };
}

/**
 * Limites effectives d'après le réglage `rate_limits` (`system_settings`, D2) : objet partiel
 * `{ règle: { limit, windowSeconds } }` fusionné avec les défauts. Tout écart (règle inconnue,
 * champ en trop, entier hors bornes) invalide le réglage entier : défauts, `valid: false`.
 */
export function resolveRateLimits(setting: unknown): {
  readonly limits: RateLimits;
  readonly valid: boolean;
} {
  if (setting === null || setting === undefined)
    return { limits: RATE_LIMIT_DEFAULTS, valid: true };
  if (typeof setting !== 'object' || Array.isArray(setting)) {
    return { limits: RATE_LIMIT_DEFAULTS, valid: false };
  }
  const limits: Record<string, RateLimit> = { ...RATE_LIMIT_DEFAULTS };
  for (const [name, value] of Object.entries(setting)) {
    const parsed = parseRateLimit(value);
    if (!isRule(name) || parsed === null) return { limits: RATE_LIMIT_DEFAULTS, valid: false };
    limits[name] = parsed;
  }
  return { limits: Object.freeze(limits), valid: true };
}

export type RateLimitDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Modèle du journal glissant : `entries` (horodatages en ms des passages acceptés) est purgé de
 * ce qui a quitté la fenêtre ; à la limite, l'attente court jusqu'à ce qu'une place se libère.
 */
export function slidingLogDecision(
  entries: readonly number[],
  nowMs: number,
  rule: RateLimit,
): RateLimitDecision & { readonly entries: number[] } {
  const windowMs = rule.windowSeconds * 1000;
  const kept = entries.filter((at) => at > nowMs - windowMs);
  // Limite abaissée : le journal peut dépasser la limite ; il faut que `kept.length - limit + 1`
  // entrées sortent, donc attendre l'entrée de rang `kept.length - limit`.
  const blocking = kept[kept.length - rule.limit];
  if (kept.length >= rule.limit && blocking !== undefined) {
    const retryAfterSeconds = Math.max(1, Math.ceil((blocking + windowMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds, entries: kept };
  }
  return { allowed: true, entries: [...kept, nowMs] };
}

/**
 * Même décision, atomique dans Redis, à l'horloge du serveur Redis (commune à toutes les instances
 * de l'API). Ensemble trié des passages ; un membre unique par passage (ARGV[3]). KEYS[1] : clé ;
 * ARGV : limite, fenêtre (ms), membre. Rend 0 si accepté, sinon l'attente en secondes.
 */
export const SLIDING_LOG_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local rank = count - limit
  local blocking = tonumber(redis.call('ZRANGE', KEYS[1], rank, rank, 'WITHSCORES')[2])
  return math.max(1, math.ceil((blocking + window - now) / 1000))
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window)
return 0
`;
