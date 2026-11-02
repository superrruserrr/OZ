import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { map, type Observable } from 'rxjs';
import { routeOf } from './metadata.js';

// Filet global des réponses (lot 1.4b, D7 ; CP-10, CP-11) : les vues par rôle décident de ce qui
// sort, ce filet arrête ce qui n'aurait jamais dû y entrer (colonne chiffrée, empreinte, secret).

const FORBIDDEN = [
  /(encrypted|hmac)$/i,
  /^password$/i,
  /(password|token|code)_?hash$/i,
  /^totp_?secret/i,
  /^document_?number$/i,
  // Clé d'objet du coffre documentaire (lot 1.9a) : jamais en réponse, seule une URL signée sort.
  /^storage_?key$/i,
];

// Un booléen `isEncrypted`, `has_hmac` décrit une donnée sans la porter. Sensible à la casse :
// `issuerEncrypted` ou `hashHmac` restent bloqués.
const DESCRIBES = /^(is|has)([A-Z]|_[a-z])/;

const isForbidden = (key: string): boolean =>
  !DESCRIBES.test(key) && FORBIDDEN.some((pattern) => pattern.test(key));

/**
 * Première clé sensible trouvée dans `value`, en profondeur, ou `null`. Une valeur binaire (colonne
 * `bytea` lue telle quelle) compte aussi : sa clé est rendue, `[]` dans un tableau.
 */
export function forbiddenKey(value: unknown): string | null {
  const seen = new WeakSet<object>();
  // Comme JSON.stringify : `toJSON` une seule fois par valeur, puis le résultat tel quel (une date
  // n'est qu'une chaîne) ; un `toJSON` qui rend l'objet lui-même laisse voir ses propres clés.
  const visit = (node: unknown, key: string, serialized = false): string | null => {
    if (node instanceof Uint8Array) return key;
    if (typeof node !== 'object' || node === null) return null;
    const { toJSON } = node as { toJSON?: unknown };
    if (!serialized && typeof toJSON === 'function' && !(node instanceof Date)) {
      return visit((toJSON as () => unknown).call(node), key, true);
    }
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node as unknown[]) {
        const found = visit(item, '[]');
        if (found !== null) return found;
      }
      return null;
    }
    for (const [name, child] of Object.entries(node)) {
      if (isForbidden(name)) return name;
      const found = visit(child, name);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(value, '');
}

/**
 * Une réponse qui porte une clé sensible devient une 500 : le corps d'origine n'est jamais envoyé, ni
 * les cookies posés par le gestionnaire. Un fichier en flux (`StreamableFile`) passe : c'est la seule
 * voie d'un binaire. Hors de portée : corps d'erreur, `@Res()` sans `passthrough`, JSON déjà
 * sérialisé en chaîne (D-090).
 */
@Injectable()
export class PayloadGuardInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(PayloadGuardInterceptor.name) private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        if (body instanceof StreamableFile) return body;
        const key = forbiddenKey(body);
        if (key === null) return body;
        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();
        if (!res.headersSent) res.removeHeader('Set-Cookie');
        this.logger.error(
          { method: req.method, route: routeOf(req), key },
          'Champ sensible dans une réponse : envoi bloqué',
        );
        throw new Error('Réponse bloquée : champ sensible');
      }),
    );
  }
}
