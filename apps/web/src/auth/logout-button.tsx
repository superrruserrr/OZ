'use client';

import { Button } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from './actions';

/** Déconnexion de cet appareil, puis retour à l'accueil. */
export function LogoutButton() {
  const t = useTranslations('auth.onboarding');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={pending}
      data-testid="logout"
      onClick={() => {
        setPending(true);
        void logout().then(() => {
          router.replace('/');
        });
      }}
    >
      {t('logout')}
    </Button>
  );
}
