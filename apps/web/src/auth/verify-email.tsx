'use client';

import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '../i18n/navigation';
import { verifyEmail } from './actions';
import { ResendVerification } from './resend-verification';

type State = 'pending' | 'done' | 'invalid' | 'missing' | 'unavailable' | 'retry';

/**
 * Lien de confirmation `…/auth/verify-email#token=…` (gabarit de l'API). Le jeton est dans le
 * fragment : jamais envoyé au serveur avec l'URL, ni dans un `Referer`. Il est lu puis retiré de
 * l'historique avant l'appel ; un rechargement ne le rejoue donc pas.
 */
export function VerifyEmail({ next = '/onboarding' }: { readonly next?: string }) {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>('pending');
  const started = useRef(false);

  useEffect(() => {
    const consume = (initial: boolean): void => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (!token) {
        if (initial) setState('missing');
        return;
      }
      setState('pending');
      void verifyEmail(token).then((result) => {
        if (result.ok) setState('done');
        // Panne ou limite : le lien reste bon, on ne propose pas un renvoi qui l'invaliderait.
        else if (result.error === 'unavailable') setState('unavailable');
        else if (result.error === 'retryLater') setState('retry');
        else setState('invalid');
      });
    };
    // Un second lien ouvert dans le même onglet ne change que le fragment : pas de rechargement.
    const onHash = (): void => {
      consume(false);
    };
    window.addEventListener('hashchange', onHash);
    if (!started.current) {
      started.current = true;
      consume(true);
    }
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const text = {
    pending: t('verify.pending'),
    done: t('verify.done'),
    invalid: t('verify.invalid'),
    missing: t('verify.missing'),
    unavailable: t('errors.unavailable'),
    retry: t('verify.retry'),
  }[state];

  return (
    <div className="flex flex-col gap-6" aria-live="polite" aria-busy={state === 'pending'}>
      <Callout testId={`verify-${state}`}>{text}</Callout>
      {state === 'done' || state === 'missing' ? (
        <Button asChild>
          <Link href={{ pathname: '/auth/login', query: { next } }} data-testid="verify-login">
            {t('verify.login')}
          </Link>
        </Button>
      ) : null}
      {state === 'invalid' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-oz-text-muted">{t('resend.leadInvalid')}</p>
          <ResendVerification scope="verify" />
        </div>
      ) : null}
    </div>
  );
}
