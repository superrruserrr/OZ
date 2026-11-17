'use client';

import { RoleCard, SportGlyph } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Écran 02 (lot 1.7ca, refonte 1.5cbb) : une carte-lien par compte ouvert — joueur (lime), tuteur
 * (bleu légal, design.md §8.4 n° 2). Les organisations arrivent au lot 1.8, après l'ouverture
 * (D3, ADR-013) : une ligne les annonce, sans carte inactive.
 */
export function RoleChooser() {
  const t = useTranslations('auth.role');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <RoleCard
          href="/auth/signup/player"
          tone="player"
          title={t('options.player.title')}
          subtitle={t('options.player.description')}
          icon={<SportGlyph sport="football" />}
          linkComponent={Link}
        />
        <RoleCard
          href="/auth/signup/guardian"
          tone="guardian"
          title={t('options.guardian.title')}
          subtitle={t('options.guardian.description')}
          icon={<ShieldIcon />}
          linkComponent={Link}
        />
      </div>
      <p className="text-sm text-oz-text-muted" data-testid="role-organizations">
        {t('organizations')}
      </p>
      <p className="border-t border-oz-border pt-5 text-sm text-oz-text-muted">
        {t('haveAccount')}{' '}
        <Link
          href="/auth/login"
          className="inline-flex min-h-11 items-center font-medium text-oz-text underline"
          data-testid="role-login"
        >
          {t('login')}
        </Link>
      </p>
    </div>
  );
}
