'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ageAt, MAJORITY_AGE } from '@oz/core';
import { signupIdentitySchema, type SignupIdentityInput } from '@oz/contracts';
import { Button, Callout, Field, Select } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { saveSignupStep } from './actions';
import type { CountryOption } from './countries';
import { signupFieldMessageKey } from './field-message';
import { callAction, StepError, useStepResult } from './step-shell';

export const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Âge indicatif à la saisie (E6) ; la minorité qui fait foi est celle calculée par le serveur. */
export function typedAge(birthDate: string | undefined): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const age = ageAt(birthDate);
  return Number.isFinite(age) && age >= 0 && age <= 120 ? age : null;
}

export interface IdentityFormProps {
  readonly saved: SignupIdentityInput | null;
  readonly countries: readonly CountryOption[];
}

/** Étape 1 : identité. Le bloc mineur (E6) s'ouvre dès qu'une date de naissance de mineur est saisie. */
export function IdentityForm({ saved, countries }: IdentityFormProps) {
  const t = useTranslations();
  const { failure, settle, clear } = useStepResult();
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupIdentityInput>({
    resolver: zodResolver(signupIdentitySchema),
    ...(saved === null ? {} : { defaultValues: saved }),
  });
  const age = typedAge(watch('birthDate'));
  const minor = age !== null && age < MAJORITY_AGE;

  const message = (field: keyof SignupIdentityInput): string | null => {
    const key = signupFieldMessageKey(errors[field]?.message ?? failure?.fields[field]);
    return key ? t(key) : null;
  };
  const optional = t('onboarding.optional');

  return (
    <form
      noValidate
      data-testid="onboarding-identity-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          clear();
          settle(await callAction(() => saveSignupStep('identity', values)));
        })(event)
      }
    >
      <StepError failure={failure} />
      <Field
        id="onboarding-first-name"
        data-testid="onboarding-first-name"
        label={t('onboarding.identity.firstName')}
        autoComplete="given-name"
        error={message('firstName')}
        {...register('firstName')}
      />
      <Field
        id="onboarding-last-name"
        data-testid="onboarding-last-name"
        label={t('onboarding.identity.lastName')}
        autoComplete="family-name"
        error={message('lastName')}
        {...register('lastName')}
      />
      <Field
        id="onboarding-birth-date"
        data-testid="onboarding-birth-date"
        label={t('onboarding.identity.birthDate')}
        type="date"
        autoComplete="bday"
        {...(age === null ? {} : { meta: t('onboarding.identity.age', { age }) })}
        error={message('birthDate')}
        {...register('birthDate')}
      />
      <Callout
        tone="legal"
        open={minor}
        live
        title={t('onboarding.identity.minorTitle')}
        testId="onboarding-minor-notice"
      >
        {t('onboarding.identity.minor')}
      </Callout>
      {(['nationality', 'country'] as const).map((field) => (
        <Controller
          key={field}
          control={control}
          name={field}
          render={({ field: control }) => (
            <Select
              id={`onboarding-${field}`}
              data-testid={`onboarding-${field}`}
              label={t(`onboarding.identity.${field}`)}
              placeholder={t('onboarding.choose')}
              options={countries}
              {...(field === 'country' ? { hint: t('onboarding.identity.countryHint') } : {})}
              {...(control.value ? { value: control.value } : {})}
              onValueChange={control.onChange}
              error={message(field)}
            />
          )}
        />
      ))}
      <Field
        id="onboarding-region"
        data-testid="onboarding-region"
        label={t('onboarding.identity.region')}
        meta={optional}
        autoComplete="address-level1"
        error={message('region')}
        {...register('region', { setValueAs: emptyToUndefined })}
      />
      <Field
        id="onboarding-city"
        data-testid="onboarding-city"
        label={t('onboarding.identity.city')}
        meta={optional}
        autoComplete="address-level2"
        error={message('city')}
        {...register('city', { setValueAs: emptyToUndefined })}
      />
      <Button type="submit" loading={isSubmitting} data-testid="onboarding-submit">
        {t('onboarding.continue')}
      </Button>
    </form>
  );
}
