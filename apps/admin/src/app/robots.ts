import type { MetadataRoute } from 'next';

/** Back-office : jamais indexé, quel que soit l'environnement. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
