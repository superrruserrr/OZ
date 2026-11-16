'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@oz/contracts';
import { Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from '../i18n/navigation';
import { resetPassword, type AuthFailure } from './actions';
import { fieldMessageKey } from './field-message';
import { FormError } from './form-error';

const passwordOnly = resetPasswordSchema.pick({ password: true });
interface PasswordOnly {
  password: string;
}
type State = 'reading' | 'form' | 'done' | 'invalid';

/**
 * Nouveau mot de passe (lot 1.7cc), lien `…/auth/reset#token=…` (gabarit de l'API). Le jeton est
 * dans le fragment : jamais envoyé avec l'URL ni dans un `Referer`. Il est lu puis retiré de
 * l'historique ; il ne vit qu'en mémoire, le temps du formulaire.
 */
export function ResetForm() {
  const t = useTranslations();
  const [state, setState] = useState<State>('reading');
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const token = useRef<string | null>(null);
  const started = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordOnly>({ resolver: zodResolver(passwordOnly) });

  useEffect(() => {
    const consume = (initial: boolean): void => {
      const read = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (read === null && !initial) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      // Jeton absent ou mal formé : refusé tout de suite, sans faire saisir un mot de passe pour rien.
      token.current = resetPasswordSchema.shape.token.safeParse(read).success ? read : null;
      setFailure(null);
      setState(token.current === null ? 'invalid' : 'form');
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

  if (state === 'reading') {
    return (
      <div aria-live="polite" aria-busy="true">
        <Callout testId="reset-reading">{t('auth.reset.reading')}</Callout>
      </div>
    );
  }

  if (state === 'done' || state === 'invalid') {
    return (
      <div aria-live="polite" className="flex flex-col gap-6">
        <Callout testId={`reset-${state}`}>
          {state === 'done' ? t('auth.reset.done') : t('auth.reset.invalid')}
        </Callout>
        <Button asChild>
          {state === 'done' ? (
            <Link href="/auth/login" data-testid="reset-login">
              {t('auth.reset.login')}
            </Link>
          ) : (
            <Link href="/auth/forgot" data-testid="reset-again">
              {t('auth.reset.again')}
            </Link>
          )}
        </Button>
      </div>
    );
  }

  const key = fieldMessageKey('password', errors.password?.message ?? failure?.fields.password);
  return (
    <form
      noValidate
      data-testid="reset-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          const result = await resetPassword(token.current, values.password);
          if (result.ok) {
            token.current = null;
            setState('done');
          } else if (result.error === 'linkInvalid') {
            token.current = null;
            setState('invalid');
          } else setFailure(result);
        })(event)
      }
    >
      <FormError failure={failure} testId="reset-error" />
      <Field
        id="reset-password"
        data-testid="reset-password"
        label={t('auth.reset.password')}
        type="password"
        autoComplete="new-password"
        hint={t('auth.signup.passwordHint')}
        error={key ? t(key) : null}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting} data-testid="reset-submit">
        {t('auth.reset.submit')}
      </Button>
    </form>
  );
}
