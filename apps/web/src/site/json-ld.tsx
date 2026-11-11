import { siteUrl } from './metadata';

/**
 * Données structurées de l'accueil (lot 1.5db, EX-106 n° 2) : organisation et site. Bloc
 * `application/ld+json` non exécuté par le navigateur (hors `script-src`) ; le `<` est échappé pour
 * qu'aucune valeur ne puisse fermer la balise. Aucune donnée de joueur.
 */
export function HomeJsonLd({ name, description }: { name: string; description: string }) {
  const url = siteUrl()?.toString();
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name, description, ...(url ? { url } : {}) },
      { '@type': 'WebSite', name, ...(url ? { url } : {}), inLanguage: ['fr', 'en'] },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
