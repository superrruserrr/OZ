import type { MetadataRoute } from 'next';
import { siteUrl } from '../site/metadata';

// Même image pour tous les environnements : la réponse dépend d'APP_ENV au moment de la requête.
export const dynamic = 'force-dynamic';

/** Profils de joueurs (toutes langues) et API : jamais indexés (EX-106 n° 3, EX-T16 n° 2). */
export const NEVER_INDEXED = ['/joueur/', '/en/joueur/', '/api/'];

/** Seule la production est indexable ; recette, prévisualisation et poste ne le sont jamais (R10). */
export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } };
  const base = siteUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: NEVER_INDEXED },
    ...(base ? { sitemap: new URL('/sitemap.xml', base).toString() } : {}),
  };
}
