import { routing } from '../i18n/routing';

/*
 * Écrans réservés à un utilisateur connecté (ADR-010). La garde est appliquée par le serveur du site
 * (`proxy.ts`) avant tout rendu ; l'API refait ses propres contrôles à chaque appel.
 */
const PROTECTED_PREFIXES = ['/onboarding'] as const;

export const LOGIN_PATH = '/auth/login';
export const DEFAULT_AFTER_LOGIN = '/onboarding';

/** Langue et chemin sans préfixe de langue (`/en/onboarding` → `en`, `/onboarding`). */
export function splitLocale(pathname: string): { locale: string; path: string } {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}`) return { locale, path: '/' };
    if (pathname.startsWith(`/${locale}/`))
      return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

export function isProtectedPath(pathname: string): boolean {
  const { path } = splitLocale(pathname);
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Chemin localisé : sans préfixe pour le français, `/en/…` pour l'anglais. */
export function localized(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path === '/' ? '' : path}`;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Destination après connexion : un chemin interne relatif seulement (pas de redirection ouverte),
 * jamais un écran d'authentification ; sinon l'écran par défaut.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return DEFAULT_AFTER_LOGIN;
  if (
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    /[\\\s]/.test(raw) ||
    hasControlCharacter(raw)
  ) {
    return DEFAULT_AFTER_LOGIN;
  }
  let url: URL;
  try {
    url = new URL(raw, 'https://oz.invalid');
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== 'https://oz.invalid') return DEFAULT_AFTER_LOGIN;
  // Après normalisation, `/.//evil.test` devient `//evil.test` : contrôles refaits sur le résultat,
  // et tout segment `.` ou `..` (même encodé) refusé d'emblée.
  if (/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(raw.split('?')[0] ?? '')) return DEFAULT_AFTER_LOGIN;
  if (url.pathname.startsWith('//') || url.pathname.includes('\\')) return DEFAULT_AFTER_LOGIN;
  const { path } = splitLocale(url.pathname);
  if (path === '/auth' || path.startsWith('/auth/')) return DEFAULT_AFTER_LOGIN;
  return `${url.pathname}${url.search}`;
}
