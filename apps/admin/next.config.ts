import { staticSecurityHeaders } from '@oz/config/security-headers';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  // Serveur Node autonome, empaqueté dans l'image Docker déployée par Coolify (lot 0.8).
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@oz/ui', '@oz/config'],
  // Back-office : jamais indexé, fichiers statiques compris. La CSP est posée par src/proxy.ts.
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: Object.entries(staticSecurityHeaders({ noIndex: true })).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ]),
};

export default withNextIntl(config);
