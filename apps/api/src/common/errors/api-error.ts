import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';

/** Corps d'erreur unique de l'API (naming_conventions.md, EX-003 n° 2). */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly details?: readonly { readonly field: string; readonly code: string }[];
}

/** Erreur métier dont le code et le message sont choisis par le code appelant, donc sûrs à exposer. */
export class AppException extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiError['details'],
  ) {
    super(message);
    this.name = 'AppException';
  }
}

// Messages génériques : le message d'une HttpException peut contenir un chemin ou un détail interne.
const HTTP_CODES: Readonly<Record<number, readonly [string, string]>> = {
  400: ['BAD_REQUEST', 'Requête invalide.'],
  401: ['UNAUTHORIZED', 'Authentification requise.'],
  403: ['FORBIDDEN', 'Accès refusé.'],
  404: ['NOT_FOUND', 'Ressource introuvable.'],
  405: ['METHOD_NOT_ALLOWED', 'Méthode non autorisée.'],
  409: ['CONFLICT', 'Conflit avec l’état actuel de la ressource.'],
  413: ['PAYLOAD_TOO_LARGE', 'Contenu trop volumineux.'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Type de contenu non pris en charge.'],
  422: ['VALIDATION_FAILED', 'Données invalides.'],
  429: ['TOO_MANY_REQUESTS', 'Trop de requêtes, réessayer plus tard.'],
  503: ['SERVICE_UNAVAILABLE', 'Service momentanément indisponible.'],
};

const INTERNAL: readonly [string, string] = ['INTERNAL_ERROR', 'Une erreur interne est survenue.'];

/**
 * Erreur de validation d'une entrée client (levée par la validation des contrats, lot 0.5).
 * Seule source de 422 : une ZodError brute vient du code interne (ligne de base, réponse de
 * fournisseur…) et devient une erreur serveur, sans exposer de nom de champ interne.
 */
export class InputValidationException extends Error {
  constructor(readonly zodError: ZodError) {
    super('Données invalides.');
    this.name = 'InputValidationException';
  }
}

const SAFE_FIELD = /^[A-Za-z0-9_.-]{1,64}$/;

/** Nom de champ affichable ; une clé fournie par l'utilisateur à la forme inattendue n'est pas renvoyée. */
function fieldName(path: readonly PropertyKey[]): string {
  const name = path.map(String).join('.');
  if (name === '') return '(racine)';
  return SAFE_FIELD.test(name) ? name : '(champ)';
}

/** Erreur client des analyseurs HTTP (body-parser, http-errors) : statut 4xx explicitement exposable. */
function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const candidate = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  if (candidate.expose !== true || typeof status !== 'number') return null;
  return status >= 400 && status < 500 ? status : null;
}

/** Convertit toute valeur lancée en statut HTTP et corps `ApiError`, sans jamais exposer de détail interne. */
export function toApiError(
  exception: unknown,
  requestId: string,
): { status: number; body: ApiError } {
  if (exception instanceof AppException) {
    const body: ApiError = { code: exception.code, message: exception.message, requestId };
    return {
      status: exception.status,
      body: exception.details ? { ...body, details: exception.details } : body,
    };
  }
  if (exception instanceof InputValidationException) {
    const [code, message] = HTTP_CODES[422] ?? INTERNAL;
    const details = exception.zodError.issues.map((issue) => ({
      field: fieldName(issue.path),
      code: issue.code,
    }));
    return { status: 422, body: { code, message, requestId, details } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const [code, message] = HTTP_CODES[status] ?? [`HTTP_${String(status)}`, 'Erreur de requête.'];
    return { status, body: { code, message, requestId } };
  }
  const clientStatus = clientErrorStatus(exception);
  if (clientStatus !== null) {
    const [code, message] = HTTP_CODES[clientStatus] ?? [
      `HTTP_${String(clientStatus)}`,
      'Erreur de requête.',
    ];
    return { status: clientStatus, body: { code, message, requestId } };
  }
  const [code, message] = INTERNAL;
  return { status: 500, body: { code, message, requestId } };
}
