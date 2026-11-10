'use client';

import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '../i18n/navigation';
import { verifyEmail } from './actions';

type State = 'pending' | 'done' | 'invalid' | 'missing' | 'unavailable';

/**
 * Lien de confirmation `…/auth/verify-email#token=…` (gabarit de l'API). Le jeton est dans le
 * fragment : jamais envoyé au serveur avec l'URL, ni dans un `Referer`. Il est lu puis retiré de
 * l'historique avant l'appel ; un rechargement ne le rejoue donc pas.
 */
export function VerifyEmail() {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>('pending');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!token) {
      setState('missing');
      return;
    }
    void verifyEmail(token).then((result) => {
      setState(result.ok ? 'done' : result.error === 'unavailable' ? 'unavailable' : 'invalid');
    });
  }, []);

  const text = {
    pending: t('verify.pending'),
    done: t('verify.done'),
    invalid: t('verify.invalid'),
    missing: t('verify.missing'),
    unavailable: t('errors.unavailable'),
  }[state];

  return (
    <div className="flex flex-col gap-6" aria-live="polite" aria-busy={state === 'pending'}>
      <Callout testId={`verify-${state}`}>{text}</Callout>
      {state === 'done' || state === 'missing' ? (
        <Button asChild>
          <Link
            href={{ pathname: '/auth/login', query: { next: '/onboarding' } }}
            data-testid="verify-login"
          >
            {t('verify.login')}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
