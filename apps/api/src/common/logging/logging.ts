import { randomUUID } from 'node:crypto';

const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Identifiant de requête : reprend l'en-tête entrant s'il est sûr, sinon en génère un (EX-T19 n° 1). */
export function resolveRequestId(header: string | readonly string[] | undefined): string {
  return typeof header === 'string' && VALID_REQUEST_ID.test(header) ? header : randomUUID();
}

const SENSITIVE_FIELDS = [
  'password',
  'email',
  'phone',
  'birthDate',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
] as const;

/**
 * Chemins masqués par pino (EX-T19 n° 2). pino n'a pas de joker récursif : chaque champ sensible
 * est couvert jusqu'à quatre niveaux d'imbrication, en plus des en-têtes d'authentification.
 */
export const REDACT_PATHS: readonly string[] = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`, `*.*.*.${field}`]),
]);

// Clés sensibles, comparées sans casse ni séparateurs (password, Password, pass_word, x-api-key…).
const SENSITIVE_KEY =
  /(password|passwd|passphrase|secret|token|apikey|authorization|cookie|otp|email|phone|birthdate|dateofbirth|^dob$)/;
const MAX_DEPTH = 10;
const MAX_KEYS = 100;
const MAX_STRING = 2_000;
const REDACTED = '[Redacted]';

// OZ ID dans un chemin (lot 1.13a) : identifiant public et stable d'une personne, jamais journalisé.
const OZ_ID_IN_PATH = /OZ-[A-Z]{2}-[0-9]{2}-[0-9A-Z]{6}-[0-9A-Z]/gi;

/**
 * Chemin de requête à journaliser : sans paramètres de requête, OZ ID remplacés par `:ozId`, y
 * compris encodés (`OZ%2DCM…`, décodés par Express avant la route). Segment indécodable : masqué.
 */
export function pathForLog(url: string): string {
  return (url.split('?')[0] ?? '')
    .split('/')
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return ':masqué';
      }
      const masked = decoded.replace(OZ_ID_IN_PATH, ':ozId');
      return masked === decoded ? segment : masked;
    })
    .join('/');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.toLowerCase().replace(/[-_\s.]/g, ''));
}

/** Lecture d'une propriété qui peut lever (accesseur) : le logger ne doit jamais échouer. */
function readProperty(target: object, key: string): unknown {
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return '[Unreadable]';
  }
}

/** Champs d'une erreur à conserver : type réel, message, pile, cause, erreurs agrégées, propriétés. */
function errorFields(error: Error): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    type: error.constructor.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause !== undefined) fields.cause = error.cause;
  if (error instanceof AggregateError) fields.errors = error.errors;
  return fields;
}

/**
 * Copie nettoyée d'une valeur à journaliser : toute clé sensible est masquée, à toute profondeur
 * (jusqu'à MAX_DEPTH), y compris dans les erreurs, leurs causes et les tableaux. Taille bornée
 * (clés, chaînes, données binaires résumées) et jamais d'exception : un log ne doit ni fuiter,
 * ni bloquer la boucle d'événements, ni faire échouer l'appelant.
 */
export function sanitizeForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[${String(value.length)} car.]`
      : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (ArrayBuffer.isView(value)) return `[Binary ${String(value.byteLength)} octets]`;
  if (value instanceof ArrayBuffer) return `[Binary ${String(value.byteLength)} octets]`;
  if (value instanceof Date) return value;
  if (value instanceof URL) return `${value.origin}${value.pathname}`; // la requête peut porter un jeton
  if (value instanceof Map) return sanitizeForLog(Object.fromEntries(value), depth, seen);
  if (value instanceof Set) return sanitizeForLog([...value], depth, seen);
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_KEYS)
      .map((item: unknown) => sanitizeForLog(item, depth + 1, seen));
    return value.length > MAX_KEYS
      ? [...items, `[…${String(value.length - MAX_KEYS)} éléments]`]
      : items;
  }

  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return '[Unreadable]';
  }
  const source: Record<string, unknown> = value instanceof Error ? errorFields(value) : {};
  for (const key of keys.slice(0, MAX_KEYS)) source[key] = readProperty(value, key);

  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    clean[key] = isSensitiveKey(key) ? REDACTED : sanitizeForLog(item, depth + 1, seen);
  }
  if (keys.length > MAX_KEYS) clean['…'] = `${String(keys.length - MAX_KEYS)} clés omises`;
  return clean;
}

/** Options pino communes (application et tests) : niveau, masquage par chemin et nettoyage récursif. */
export function loggerOptions(level: string): {
  level: string;
  redact: { paths: string[]; censor: string };
  formatters: { log: (object: Record<string, unknown>) => Record<string, unknown> };
  serializers: { err: (value: unknown) => unknown };
} {
  return {
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    // L'erreur est déjà mise en forme (type réel, cause…) par formatters.log : pas de seconde passe,
    // qui remplacerait son type par « Object ».
    serializers: { err: (value) => value },
    formatters: {
      // pino applique ce formateur AVANT les sérialiseurs : req/res bruts sont confiés à ces derniers.
      log: (object) => {
        const clean: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(object)) {
          clean[key] =
            key === 'req' || key === 'res'
              ? item
              : isSensitiveKey(key)
                ? REDACTED
                : sanitizeForLog(item);
        }
        return clean;
      },
    },
  };
}
