// .env.example : gabarit complet, sans aucune valeur secrète (R8, EX-T08), cohérent avec compose.dev.yml.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ENV_EXAMPLE = new URL('../.env.example', import.meta.url);
const COMPOSE = new URL('../infra/docker/compose.dev.yml', import.meta.url);

function parseEnv(text) {
  const vars = new Map();
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match?.[1]) throw new Error(`ligne ${index + 1} illisible : ${raw}`);
    vars.set(match[1], (match[2] ?? '').replace(/\s+#.*$/, '').trim());
  }
  return vars;
}

const env = existsSync(ENV_EXAMPLE) ? parseEnv(readFileSync(ENV_EXAMPLE, 'utf8')) : new Map();

// Identifiants des conteneurs locaux : seules valeurs « sensibles » autorisées, et uniquement des valeurs
// de développement évidentes (préfixe oz), jamais réutilisables ailleurs.
const LOCAL_DEV_CREDENTIALS = new Set(['POSTGRES_PASSWORD', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']);
const SENSITIVE = /SECRET|KEY|TOKEN|PASSWORD|DSN|SID/;

const REQUIRED = [
  // Annexe C du plan
  'NODE_ENV',
  'APP_ENV',
  'API_PORT',
  'CORS_ORIGINS',
  'APP_URL',
  'API_URL',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'ARGON2_MEMORY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'SIGNED_URL_TTL',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
  'RECAPTCHA_SITE_KEY',
  'RECAPTCHA_SECRET_KEY',
  'RECAPTCHA_MIN_SCORE',
  'SENTRY_DSN',
  'LOG_LEVEL',
  'KYC_AUTO_APPROVE_THRESHOLD',
  'KYC_AUTO_REJECT_THRESHOLD',
  'KYC_MINOR_REQUIRES_DUAL_APPROVAL',
  'DOCUMENT_RETENTION_DAYS',
  // Conteneurs locaux (TD-004)
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  // Email — Scaleway TEM (TD-011), Mailpit en local
  'EMAIL_PROVIDER',
  'SCW_TEM_PROJECT_ID',
  'SCW_TEM_SECRET_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  // SMS / OTP — Infobip puis Twilio (TD-012)
  'SMS_PROVIDER_PRIMARY',
  'SMS_PROVIDER_FALLBACK',
  'INFOBIP_BASE_URL',
  'INFOBIP_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  // Paiements — Stripe + CinetPay (TD-013)
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'MOBILE_MONEY_PROVIDER',
  'CINETPAY_SITE_ID',
  'CINETPAY_API_KEY',
  'CINETPAY_SECRET_KEY',
  // Observabilité (TD-014)
  'SENTRY_ENVIRONMENT',
  // KYC — fournisseur choisi au lot 1.10 (TD-015) ; frontières IA (TD-016)
  'IDENTITY_VERIFIER_PROVIDER',
  'IDENTITY_VERIFIER_API_KEY',
  'IDENTITY_VERIFIER_WEBHOOK_SECRET',
  'FEATURE_KYC_AUTO_APPROVE_ADULTS',
];

describe('.env.example (EX-T08)', () => {
  it('existe et se lit ligne à ligne', () => {
    expect(existsSync(ENV_EXAMPLE)).toBe(true);
    expect(env.size).toBeGreaterThan(0);
  });

  it('déclare toutes les variables attendues (Annexe C + fournisseurs TD-011 à TD-016)', () => {
    expect(REQUIRED.filter((name) => !env.has(name))).toEqual([]);
  });

  it('laisse vide toute variable sensible, hors identifiants des conteneurs locaux', () => {
    const filled = [...env].filter(
      ([name, value]) => SENSITIVE.test(name) && value !== '' && !LOCAL_DEV_CREDENTIALS.has(name),
    );
    expect(filled).toEqual([]);
  });

  it('limite les identifiants locaux à des valeurs de développement évidentes', () => {
    for (const name of LOCAL_DEV_CREDENTIALS) {
      expect(env.get(name), name).toMatch(/^oz(-[a-z]+)*$/);
    }
  });

  it('active les garde-fous KYC par défaut (TD-016)', () => {
    expect(env.get('KYC_MINOR_REQUIRES_DUAL_APPROVAL')).toBe('true');
    expect(env.get('FEATURE_KYC_AUTO_APPROVE_ADULTS')).toBe('false');
  });

  it('garde DATABASE_URL cohérente avec les identifiants du conteneur PostgreSQL', () => {
    const url = new URL(env.get('DATABASE_URL') ?? '');
    expect(url.username).toBe(env.get('POSTGRES_USER'));
    expect(url.password).toBe(env.get('POSTGRES_PASSWORD'));
    expect(url.pathname.slice(1)).toBe(env.get('POSTGRES_DB'));
    expect(url.hostname).toBe('localhost');
  });

  it('déclare toutes les variables lues par compose.dev.yml', () => {
    expect(existsSync(COMPOSE)).toBe(true);
    const used = [...readFileSync(COMPOSE, 'utf8').matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    expect([...new Set(used)].filter((name) => !env.has(name))).toEqual([]);
  });
});
