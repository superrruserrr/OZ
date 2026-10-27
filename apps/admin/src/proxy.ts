import {
  createNonce,
  isSecureRequest,
  pageSecurityHeaders,
  resolveAppEnv,
} from '@oz/config/security-headers';
import { NextResponse, type NextRequest } from 'next/server';

/** Nonce par requête et en-têtes du back-office (CSP, plan §6.5 ; jamais indexé). */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const headers = pageSecurityHeaders(
    {
      nonce,
      development: process.env.NODE_ENV === 'development',
      secureTransport: isSecureRequest({
        appEnv: resolveAppEnv(process.env.APP_ENV, process.env.NODE_ENV),
        protocol: request.nextUrl.protocol,
        forwardedProto: request.headers.get('x-forwarded-proto'),
      }),
    },
    { noIndex: true },
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy'] ?? '');
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
