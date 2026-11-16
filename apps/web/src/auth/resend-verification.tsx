'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resendVerificationSchema, type ResendVerificationInput } from '@oz/contracts';
import { Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resendVerification, type AuthFailure } from './actions';
import { fieldMessageKey } from './field-message';
import { FormError } from './form-error';

export interface ResendVerificationProps {
  /** Adresse déjà saisie (après l'inscription) ; sinon l'écran la demande. */
  readonly email?: string;
  /** Préfixe des `data-testid` : `signup` ou `verify`. */
  readonly scope: 'signup' | 'verify';
}

/**
 * Renvoi de l'email de confirmation (lot 1.7cc). Même message que le compte existe ou non (CP-28) ;
 * le lien précédent cesse de fonctionner.
 */
export function ResendVerification({ email, scope }: ResendVerificationProps) {
  const t = useTranslations();
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email: email ?? '' },
  });

  if (done) {
    return (
      <div aria-live="polite">
        <Callout testId="resend-done">{t('auth.resend.done')}</Callout>
      </div>
    );
  }

  const key = fieldMessageKey('email', errors.email?.message ?? failure?.fields.email);
  return (
    <form
      noValidate
      data-testid={`${scope}-resend-form`}
      className="flex flex-col gap-4"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          const result = await resendVerification(values.email);
          if (result.ok) setDone(true);
          else setFailure(result);
        })(event)
      }
    >
      <FormError failure={failure} testId="resend-error" />
      {email === undefined ? (
        <Field
          id={`${scope}-resend-email`}
          data-testid={`${scope}-resend-email`}
          label={t('auth.resend.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={key ? t(key) : null}
          {...register('email')}
        />
      ) : (
        <input type="hidden" {...register('email')} />
      )}
      <Button
        type="submit"
        variant="secondary"
        loading={isSubmitting}
        data-testid={email === undefined ? `${scope}-resend-submit` : `${scope}-resend`}
      >
        {t('auth.resend.submit')}
      </Button>
    </form>
  );
}
