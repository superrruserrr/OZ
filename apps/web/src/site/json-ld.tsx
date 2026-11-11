import { headers } from 'next/headers';
import { siteUrl } from './metadata';

/** Organisation et site, sans aucune donnée de joueur. */
export function homeJsonLdData(name: string, description: string, url: string | undefined) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name, description, ...(url ? { url } : {}) },
      { '@type': 'WebSite', name, ...(url ? { url } : {}), inLanguage: ['fr', 'en'] },
    ],
  };
}

/** Sérialisation sûre dans une balise `script` : `<` échappé, aucune valeur ne peut la fermer. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Données structurées de l'accueil (lot 1.5db, EX-106 n° 2). Bloc `application/ld+json`, non exécuté
 * par le navigateur ; il porte quand même le nonce de la requête, comme tout `script` servi
 * (EX-T17.2).
 */
export async function HomeJsonLd({ name, description }: { name: string; description: string }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(homeJsonLdData(name, description, siteUrl()?.toString())),
      }}
    />
  );
}
