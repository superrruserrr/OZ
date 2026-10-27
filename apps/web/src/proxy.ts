import {
  createNonce,
  isSecureRequest,
  pageSecurityHeaders,
  resolveAppEnv,
} from '@oz/config/security-headers';
import createMiddleware from 'next-intl/middleware';
import { NextRequest, type NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

/**
 * Chaque page reçoit un nonce neuf (CSP, plan §6.5). La CSP est posée sur la requête transmise au rendu
 * — Next y lit le nonce pour l'apposer à ses scripts — et sur la réponse envoyée au navigateur.
 */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const headers = pageSecurityHeaders({
    nonce,
    development: process.env.NODE_ENV === 'development',
    secureTransport: isSecureRequest({
      appEnv: resolveAppEnv(process.env.APP_ENV, process.env.NODE_ENV),
      protocol: request.nextUrl.protocol,
      forwardedProto: request.headers.get('x-forwarded-proto'),
    }),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy'] ?? '');
  requestHeaders.set('x-nonce', nonce);

  // next-intl recopie les en-têtes de la requête reçue dans sa réécriture ou sa suite.
  const response = handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Toutes les pages, y compris une adresse contenant un point ou commençant par « api » ;
  // seuls l'API, les fichiers de Next et les fichiers racine connus (robots, icônes, manifeste) sont exclus.
  matcher: [
    '/((?!api/|_next/static/|_next/image|_vercel/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|(?:apple-)?icon(?:-\\w+)?\\.(?:svg|png|ico)$).*)',
  ],
};
