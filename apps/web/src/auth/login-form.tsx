'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@oz/contracts';
import { Button, Field, OtpInput } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from '../i18n/navigation';
import { login, loginTwoFactor, type AuthFailure, type AuthResult } from './actions';
import { fieldMessageKey } from './field-message';
import { FormError } from './form-error';

export interface LoginFormProps {
  /** Destination demandée (`?next=`) ; revalidée par le serveur (`safeNext`). */
  readonly next: string | null;
}

/** Connexion (lot 1.7ca) ; second facteur si le compte l'exige, défi gardé par le serveur. */
export function LoginForm({ next }: LoginFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'code'>('credentials');
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [verifying, setVerifying] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const settle = (result: AuthResult<{ next: string } | { twoFactor: true }>): void => {
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setFailure(null);
    if ('twoFactor' in result) setStep('code');
    else router.replace(result.next);
  };

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-5" data-testid="login-code-step">
        <h2 className="font-display text-xl font-semibold">{t('auth.login.codeTitle')}</h2>
        <p className="text-oz-text-muted">{t('auth.login.codeLead')}</p>
        <FormError failure={failure} testId="login-error" />
        <OtpInput
          id="login-code"
          testId="login-code"
          label={t('auth.login.codeLabel')}
          digitLabel={(position, total) => t('auth.login.digit', { position, total })}
          disabled={verifying}
          error={failure ? t(`auth.errors.${failure.error}`) : null}
          onComplete={(code) => {
            setVerifying(true);
            void loginTwoFactor(code, next).then((result) => {
              setVerifying(false);
              settle(result);
            });
          }}
        />
        <Button
          variant="secondary"
          type="button"
          data-testid="login-back"
          onClick={() => {
            setFailure(null);
            setStep('credentials');
          }}
        >
          {t('auth.login.back')}
        </Button>
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
      data-testid="login-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          settle(await login(values, next));
        })(event)
      }
    >
      <FormError failure={failure} testId="login-error" />
      <Field
        id="login-email"
        data-testid="login-email"
        label={t('auth.login.email')}
        type="email"
        autoComplete="username"
        inputMode="email"
        error={message('email')}
        {...register('email')}
      />
      <Field
        id="login-password"
        data-testid="login-password"
        label={t('auth.login.password')}
        type="password"
        autoComplete="current-password"
        error={message('password')}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting} data-testid="login-submit">
        {t('auth.login.submit')}
      </Button>
      <p className="text-sm text-oz-text-muted">
        {t('auth.login.noAccount')}{' '}
        <Link
          href="/auth/role"
          className="inline-flex min-h-11 items-center font-semibold text-oz-text underline"
          data-testid="login-signup"
        >
          {t('auth.login.signup')}
        </Link>
      </p>
    </form>
  );
}
