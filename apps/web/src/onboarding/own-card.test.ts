// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('../i18n/navigation', () => ({ Link: () => null }));

const { ownQrDataUri } = await import('./own-card');

const OZ_ID = 'OZ-CM-26-7K4M9Q-M';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('QR de la carte relue (D-133)', () => {
  it('image data: SVG sans script, vers la page du profil seulement', () => {
    vi.stubEnv('APP_URL', 'https://oz.example.test');
    const uri = ownQrDataUri(OZ_ID);
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
    const svg = Buffer.from((uri ?? '').split(',')[1] ?? '', 'base64').toString('utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/<script|href=|on\w+=/i);
  });

  it('sans adresse publique, ou adresse refusée, ou OZ ID hors format : pas de QR', () => {
    vi.stubEnv('APP_URL', '');
    expect(ownQrDataUri(OZ_ID)).toBeNull();
    vi.stubEnv('APP_URL', 'http://oz.example.test');
    expect(ownQrDataUri(OZ_ID)).toBeNull();
    vi.stubEnv('APP_URL', 'https://oz.example.test');
    expect(ownQrDataUri('../admin')).toBeNull();
  });
});
