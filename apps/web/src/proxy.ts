import {
  createNonce,
  isSecureRequest,
  pageSecurityHeaders,
  resolveAppEnv,
} from '@oz/config/security-headers';
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedSessionCookies,
  isRefreshValue,
  readAccessToken,
  writeCookies,
  type CookieSpec,
} from './session/cookies';
import { LOGIN_PATH, isProtectedPath, localized, splitLocale } from './session/protected-routes';
import { refreshSession } from './session/refresh';

const handleI18nRouting = createMiddleware(routing);

/** Renouvellement anticipé : un jeton à moins d'une minute de l'échéance est remplacé avant le rendu. */
const RENEW_BEFORE_MS = 60_000;

/**
 * Chaque page reçoit un nonce neuf (CSP, plan §6.5). La CSP est posée sur la requête transmise au rendu
 * — Next y lit le nonce pour l'apposer à ses scripts — et sur la réponse envoyée au navigateur.
 * Les écrans connectés (ADR-010) sont gardés ici, seul endroit où une page peut encore poser des
 * cookies avant le rendu : session renouvelée, sinon renvoi à la connexion. Les pages publiques
 * n'appellent jamais l'API.
 */
export default function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
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
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return secured(render(request, requestHeaders), headers);
  }
  return guarded(request, requestHeaders, headers);
}

function render(request: NextRequest, requestHeaders: Headers): NextResponse {
  // next-intl recopie les en-têtes de la requête reçue dans sa réécriture ou sa suite.
  return handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
}

function secured(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function guarded(
  request: NextRequest,
  requestHeaders: Headers,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const now = Date.now();
  const access = readAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
  const valid = access !== null && access.expiresAt > now;
  if (access !== null && access.expiresAt - now > RENEW_BEFORE_MS) {
    return secured(render(request, requestHeaders), headers);
  }
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  // Un préchargement de lien ne consomme jamais le jeton : deux rotations concurrentes du même jeton
  // passeraient pour un rejeu et révoqueraient la famille (D-132, fenêtre de grâce côté API).
  if (isPrefetch(request)) {
    return valid
      ? secured(render(request, requestHeaders), headers)
      : toLogin(request, headers, []);
  }
  if (!isRefreshValue(refresh)) {
    return valid
      ? secured(render(request, requestHeaders), headers)
      : toLogin(request, headers, clearedSessionCookies());
  }
  const outcome = await refreshSession(refresh, {
    forwardedFor: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });
  switch (outcome.kind) {
    case 'renewed': {
      // Le rendu de cette même requête doit déjà voir les nouveaux cookies.
      requestHeaders.set('cookie', withCookies(request, outcome.cookies));
      const response = render(request, requestHeaders);
      writeCookies(response.cookies, outcome.cookies);
      return secured(response, headers);
    }
    case 'refused':
      return toLogin(request, headers, clearedSessionCookies());
    case 'unavailable':
      // Panne passagère : rien n'est effacé ; un jeton encore valable suffit pour cette page.
      return valid
        ? secured(render(request, requestHeaders), headers)
        : toLogin(request, headers, []);
  }
}

function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose')?.includes('prefetch') === true
  );
}

/** En-tête Cookie de la requête, avec les cookies renouvelés à la place des anciens. */
function withCookies(request: NextRequest, specs: readonly CookieSpec[]): string {
  const replaced = new Set(specs.map((spec) => spec.name));
  const kept = request.cookies
    .getAll()
    .filter((entry) => !replaced.has(entry.name))
    .map((entry) => `${entry.name}=${entry.value}`);
  return [...kept, ...specs.map((spec) => `${spec.name}=${spec.value}`)].join('; ');
}

function toLogin(
  request: NextRequest,
  headers: Record<string, string>,
  cookies: readonly CookieSpec[],
): NextResponse {
  const { locale } = splitLocale(request.nextUrl.pathname);
  const target = new URL(localized(locale, LOGIN_PATH), request.url);
  // Chemin complet (langue comprise), revalidé par `safeNext` après la connexion.
  target.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(target, 303);
  writeCookies(response.cookies, cookies);
  response.headers.set('Cache-Control', 'no-store');
  return secured(response, headers);
}

export const config = {
  // Toutes les pages, y compris une adresse contenant un point ou commençant par « api » ;
  // seuls l'API, les fichiers de Next, les logos (`brand/oz-logo-*.png`) et les fichiers racine connus (robots, icônes,
  // manifeste) sont exclus.
  matcher: [
    '/((?!api/|brand/oz-logo-[\\w-]+\\.png$|_next/static/|_next/image|_vercel/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|(?:apple-)?icon(?:-\\w+)?\\.(?:svg|png|ico)$).*)',
  ],
};
