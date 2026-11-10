'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signupSportSchema, type SignupSportInput } from '@oz/contracts';
import { Button, ChoiceCardGroup, Field, Select } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { saveSignupStep } from './actions';
import { messageKey, signupFieldMessageKey, valueProp } from './field-message';
import { emptyToUndefined } from './identity-form';
import { callAction, StepError, useStepResult } from './step-shell';

/** Radix Select n'accepte pas de valeur vide : « aucun poste secondaire ». */
const NO_POSITION = 'none';
const FEET = ['right', 'left', 'both'] as const;

const toNumber = (value: unknown): unknown => {
  const empty = emptyToUndefined(value);
  return empty === undefined ? undefined : Number(empty);
};

export function SportForm({ saved }: { readonly saved: SignupSportInput | null }) {
  const t = useTranslations();
  const { failure, settle, clear } = useStepResult();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupSportInput>({
    resolver: zodResolver(signupSportSchema),
    ...(saved === null ? {} : { defaultValues: saved }),
  });
  const positions = signupSportSchema.shape.primaryPosition.options.map((value) => ({
    value,
    label: t(`onboarding.positions.${messageKey(value)}`),
  }));
  const message = (field: keyof SignupSportInput): string | null => {
    const key = signupFieldMessageKey(errors[field]?.message ?? failure?.fields[field]);
    return key ? t(key) : null;
  };
  const footError = message('dominantFoot');

  return (
    <form
      noValidate
      data-testid="onboarding-sport-form"
      className="flex flex-col gap-5"
      onSubmit={(event) =>
        void handleSubmit(async (values) => {
          clear();
          settle(await callAction(() => saveSignupStep('sport', values)));
        })(event)
      }
    >
      <StepError failure={failure} />
      <Controller
        control={control}
        name="primaryPosition"
        render={({ field }) => (
          <Select
            id="onboarding-primary-position"
            data-testid="onboarding-primary-position"
            label={t('onboarding.sport.primaryPosition')}
            placeholder={t('onboarding.choose')}
            options={positions}
            {...valueProp(field.value)}
            onValueChange={field.onChange}
            error={message('primaryPosition')}
          />
        )}
      />
      <Controller
        control={control}
        name="secondaryPosition"
        render={({ field }) => (
          <Select
            id="onboarding-secondary-position"
            data-testid="onboarding-secondary-position"
            label={t('onboarding.sport.secondaryPosition')}
            hint={t('onboarding.optional')}
            options={[{ value: NO_POSITION, label: t('onboarding.sport.none') }, ...positions]}
            value={field.value ?? NO_POSITION}
            onValueChange={(value) => {
              field.onChange(value === NO_POSITION ? undefined : value);
            }}
            error={message('secondaryPosition')}
          />
        )}
      />
      <Controller
        control={control}
        name="dominantFoot"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <ChoiceCardGroup
              label={t('onboarding.sport.dominantFoot')}
              testId="onboarding-foot"
              options={FEET.map((value) => ({ value, title: t(`onboarding.sport.feet.${value}`) }))}
              value={field.value}
              onValueChange={field.onChange}
            />
            {footError ? (
              <p
                className="text-sm text-oz-danger"
                role="alert"
                data-testid="onboarding-foot-error"
              >
                {footError}
              </p>
            ) : null}
          </div>
        )}
      />
      <Field
        id="onboarding-height"
        data-testid="onboarding-height"
        label={t('onboarding.sport.heightCm')}
        meta={t('onboarding.optional')}
        hint={t('onboarding.sport.heightHint')}
        type="number"
        inputMode="numeric"
        min={80}
        max={230}
        error={message('heightCm')}
        {...register('heightCm', { setValueAs: toNumber })}
      />
      <Field
        id="onboarding-weight"
        data-testid="onboarding-weight"
        label={t('onboarding.sport.weightKg')}
        meta={t('onboarding.optional')}
        hint={t('onboarding.sport.weightHint')}
        type="number"
        inputMode="numeric"
        min={15}
        max={150}
        error={message('weightKg')}
        {...register('weightKg', { setValueAs: toNumber })}
      />
      <Button type="submit" loading={isSubmitting} data-testid="onboarding-submit">
        {t('onboarding.continue')}
      </Button>
    </form>
  );
}
