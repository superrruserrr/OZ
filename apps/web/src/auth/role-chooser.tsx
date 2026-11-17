'use client';

import { Button, ChoiceCardGroup } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '../i18n/navigation';

/** Écran 02 : joueur (lot 1.7) et tuteur (lot 1.7bc) ouverts ; organisations au lot 1.8. */
const ROLES = [
  'player',
  'guardian',
  'academy',
  'club',
  'federation',
  'center',
  'recruiter',
] as const;
const OPEN: ReadonlySet<string> = new Set(['player', 'guardian']);
const SIGNUP_PATH: Readonly<Record<string, string>> = {
  player: '/auth/signup/player',
  guardian: '/auth/signup/guardian',
};

export function RoleChooser() {
  const t = useTranslations('auth.role');
  const [role, setRole] = useState<string>('player');
  return (
    <div className="flex flex-col gap-6">
      <ChoiceCardGroup
        label={t('group')}
        testId="role-card"
        value={role}
        onValueChange={setRole}
        options={ROLES.map((value) => ({
          value,
          title: t(`options.${value}.title`),
          description: OPEN.has(value)
            ? t(`options.${value}.description`)
            : `${t(`options.${value}.description`)} · ${t('soon')}`,
          disabled: !OPEN.has(value),
        }))}
      />
      <Button asChild>
        <Link href={SIGNUP_PATH[role] ?? '/auth/signup/player'} data-testid="role-continue">
          {t('continue')}
        </Link>
      </Button>
      <p className="text-sm text-oz-text-muted">
        {t('haveAccount')}{' '}
        <Link
          href="/auth/login"
          className="inline-flex min-h-11 items-center font-semibold text-oz-text underline"
          data-testid="role-login"
        >
          {t('login')}
        </Link>
      </p>
    </div>
  );
}
