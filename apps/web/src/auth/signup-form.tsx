'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@oz/contracts';
import { Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from '../i18n/navigation';
import { registerAccount, type AuthFailure } from './actions';
import { fieldMessageKey } from './field-message';
import { FormError } from './form-error';

export interface SignupFormProps {
  /** Jeton du formulaire, obtenu par le serveur du site au rendu (D6 du lot 1.3ca). */
  readonly formToken: string;
}

/**
 * Création du compte joueur : validée dans le navigateur (C1) puis par l'action serveur (C2). Le
 * champ piège reste invisible et hors de l'ordre de tabulation. Succès : même écran que l'adresse
 * soit déjà inscrite ou non (CP-28).
 */
export function SignupForm({ formToken }: SignupFormProps) {
  const t = useTranslations();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { formToken, website: '' },
  });

  if (sent) {
    return (
      <div aria-live="polite">
        <Callout title={t('auth.signup.sentTitle')} testId="signup-sent">
          {t('auth.signup.sent')}
        </Callout>
      </div>
    );
  }

  const message = (field: 'email' | 'password'): string | null => {
    const key = fieldMessageKey(field, errors[field]?.message ?? failure?.fields[field]);
    return key ? t(key) : null;
  };

  return (
    <form
      noValidate
      data-testid="signup-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          const result = await registerAccount(values);
          if (result.ok) setSent(true);
          else setFailure(result);
        })(event)
      }
    >
      <FormError failure={failure} testId="signup-error" />
      <Field
        id="signup-email"
        data-testid="signup-email"
        label={t('auth.signup.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={message('email')}
        {...register('email')}
      />
      <Field
        id="signup-password"
        data-testid="signup-password"
        label={t('auth.signup.password')}
        type="password"
        autoComplete="new-password"
        hint={t('auth.signup.passwordHint')}
        error={message('password')}
        {...register('password')}
      />
      {/* Champ piège (D6) : un humain ne le voit pas et n'y arrive pas au clavier. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="signup-website">{t('auth.signup.website')}</label>
        <input id="signup-website" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>
      <input type="hidden" {...register('formToken')} />
      <div className="text-sm text-oz-text-muted">
        <p>{t('auth.signup.terms')}</p>
        <p className="flex flex-wrap gap-x-4">
          <Link href="/legal/cgu" className="inline-flex min-h-11 items-center underline">
            {t('auth.signup.termsLink')}
          </Link>
          <Link
            href="/legal/confidentialite"
            className="inline-flex min-h-11 items-center underline"
          >
            {t('auth.signup.privacyLink')}
          </Link>
        </p>
      </div>
      <Button type="submit" loading={isSubmitting} data-testid="signup-submit">
        {t('auth.signup.submit')}
      </Button>
    </form>
  );
}
