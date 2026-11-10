'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signupGuardianSchema, type SignupGuardianInput } from '@oz/contracts';
import { Button, Callout, Field, Select } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { saveSignupStep } from './actions';
import type { CountryOption } from './countries';
import { messageKey, signupFieldMessageKey, valueProp } from './field-message';
import { emptyToUndefined } from './identity-form';
import { callAction, StepError, useStepResult } from './step-shell';

const RELATIONSHIPS = ['mother', 'father', 'legal_guardian', 'other'] as const;

export interface GuardianFormProps {
  readonly saved: SignupGuardianInput | null;
  readonly countries: readonly CountryOption[];
}

/** Étape tuteur, obligatoire et bloquante pour un mineur (EX-107 n° 4) : un contact au moins. */
export function GuardianForm({ saved, countries }: GuardianFormProps) {
  const t = useTranslations();
  const { failure, settle, clear } = useStepResult();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupGuardianInput>({
    resolver: zodResolver(signupGuardianSchema),
    ...(saved === null ? {} : { defaultValues: saved }),
  });
  const message = (field: keyof SignupGuardianInput): string | null => {
    const key = signupFieldMessageKey(errors[field]?.message ?? failure?.fields[field]);
    return key ? t(key) : null;
  };

  return (
    <form
      noValidate
      data-testid="onboarding-guardian-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          clear();
          settle(await callAction(() => saveSignupStep('guardian', values)));
        })(event)
      }
    >
      <StepError failure={failure} />
      <Field
        id="onboarding-guardian-first-name"
        data-testid="onboarding-guardian-first-name"
        label={t('onboarding.guardian.firstName')}
        autoComplete="off"
        error={message('firstName')}
        {...register('firstName')}
      />
      <Field
        id="onboarding-guardian-last-name"
        data-testid="onboarding-guardian-last-name"
        label={t('onboarding.guardian.lastName')}
        autoComplete="off"
        error={message('lastName')}
        {...register('lastName')}
      />
      <Controller
        control={control}
        name="relationship"
        render={({ field }) => (
          <Select
            id="onboarding-guardian-relationship"
            data-testid="onboarding-guardian-relationship"
            label={t('onboarding.guardian.relationship')}
            placeholder={t('onboarding.choose')}
            options={RELATIONSHIPS.map((value) => ({
              value,
              label: t(`onboarding.guardian.relationships.${messageKey(value)}`),
            }))}
            {...valueProp(field.value)}
            onValueChange={field.onChange}
            error={message('relationship')}
          />
        )}
      />
      <Controller
        control={control}
        name="country"
        render={({ field }) => (
          <Select
            id="onboarding-guardian-country"
            data-testid="onboarding-guardian-country"
            label={t('onboarding.guardian.country')}
            placeholder={t('onboarding.choose')}
            options={countries}
            {...valueProp(field.value)}
            onValueChange={field.onChange}
            error={message('country')}
          />
        )}
      />
      <Callout tone="legal" testId="onboarding-guardian-contact">
        {t('onboarding.guardian.contactHint')}
      </Callout>
      <Field
        id="onboarding-guardian-phone"
        data-testid="onboarding-guardian-phone"
        label={t('onboarding.guardian.phone')}
        hint={t('onboarding.guardian.phoneHint')}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        error={message('phone')}
        {...register('phone', { setValueAs: emptyToUndefined })}
      />
      <Field
        id="onboarding-guardian-email"
        data-testid="onboarding-guardian-email"
        label={t('onboarding.guardian.email')}
        type="email"
        inputMode="email"
        autoComplete="off"
        error={message('email')}
        {...register('email', { setValueAs: emptyToUndefined })}
      />
      <Button type="submit" loading={isSubmitting} data-testid="onboarding-submit">
        {t('onboarding.continue')}
      </Button>
    </form>
  );
}
