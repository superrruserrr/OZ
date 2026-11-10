import { staticSecurityHeaders } from '@oz/config/security-headers';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  // Serveur Node autonome, empaqueté dans l'image Docker déployée par Coolify (lot 0.8).
  output: 'standalone',
  poweredByHeader: false,
  // Textes légaux lus par le serveur (lot 1.6) : copiés dans l'image autonome.
  outputFileTracingIncludes: { '/[locale]/legal/[doc]': ['../../docs/legal/*.md'] },
  reactStrictMode: true,
  transpilePackages: ['@oz/ui', '@oz/contracts', '@oz/config'],
  // 404 rendue côté serveur malgré un layout racine dynamique ([locale]) : app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // Fichiers statiques compris : la CSP avec nonce est posée par src/proxy.ts sur les pages.
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: Object.entries(staticSecurityHeaders()).map(([key, value]) => ({ key, value })),
      },
    ]),
};

export default withNextIntl(config);
