import type { MetadataRoute } from 'next';

// Même image pour tous les environnements : la réponse dépend d'APP_ENV au moment de la requête.
export const dynamic = 'force-dynamic';

/** Seule la production est indexable ; recette, prévisualisation et poste ne le sont jamais (R10). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.APP_ENV === 'production'
        ? { userAgent: '*', allow: '/' }
        : { userAgent: '*', disallow: '/' },
  };
}
