'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@oz/contracts';
import { Button, Callout, Field } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from '../i18n/navigation';
import { requestPasswordReset, type AuthFailure } from './actions';
import { fieldMessageKey } from './field-message';
import { FormError } from './form-error';

/** Mot de passe oublié (lot 1.7cc) : même confirmation que le compte existe ou non (CP-28). */
export function ForgotForm() {
  const t = useTranslations();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({ resolver: zodResolver(requestPasswordResetSchema) });

  if (sent) {
    return (
      <div aria-live="polite" className="flex flex-col gap-6">
        <Callout title={t('auth.forgot.sentTitle')} testId="forgot-sent">
          {t('auth.forgot.sent')}
        </Callout>
        <BackToLogin label={t('auth.forgot.back')} />
      </div>
    );
  }

  const key = fieldMessageKey('email', errors.email?.message ?? failure?.fields.email);
  return (
    <form
      noValidate
      data-testid="forgot-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          const result = await requestPasswordReset(values.email);
          if (result.ok) setSent(true);
          else setFailure(result);
        })(event)
      }
    >
      <FormError failure={failure} testId="forgot-error" />
      <Field
        id="forgot-email"
        data-testid="forgot-email"
        label={t('auth.forgot.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={key ? t(key) : null}
        {...register('email')}
      />
      <Button type="submit" loading={isSubmitting} data-testid="forgot-submit">
        {t('auth.forgot.submit')}
      </Button>
      <BackToLogin label={t('auth.forgot.back')} />
    </form>
  );
}

function BackToLogin({ label }: { label: string }) {
  return (
    <p className="text-sm text-oz-text-muted">
      <Link
        href="/auth/login"
        className="inline-flex min-h-11 items-center font-semibold text-oz-text underline"
        data-testid="forgot-login"
      >
        {label}
      </Link>
    </p>
  );
}
