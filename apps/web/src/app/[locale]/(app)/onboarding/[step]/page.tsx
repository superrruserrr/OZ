import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { isValidElement } from 'react';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { redirect } from '../../../../../i18n/navigation';
import { AffiliationStep } from '../../../../../onboarding/affiliation-step';
import { countryOptions } from '../../../../../onboarding/countries';
import { GuardianForm } from '../../../../../onboarding/guardian-form';
import { IdentityForm } from '../../../../../onboarding/identity-form';
import { formatResume, loadDraft } from '../../../../../onboarding/load-draft';
import { SportForm } from '../../../../../onboarding/sport-form';
import { StepShell } from '../../../../../onboarding/step-shell';
import {
  openStep,
  previousPath,
  progress,
  stepFromSlug,
  stepPath,
} from '../../../../../onboarding/steps';

export const generateMetadata = () => authMetadata('onboarding');

/** Une étape du parcours (EX-107) : ouverte seulement dans l'ordre, données relues sur l'API. */
export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const step = stepFromSlug((await params).step);
  if (step === null) notFound();
  const locale = await rootLocale();
  const draft = await loadDraft(stepPath(step));
  if (isValidElement(draft)) return draft;
  const status = draft;
  const opened = openStep(step, status);
  if ('redirect' in opened) redirect({ href: opened.redirect, locale });

  const t = await getTranslations({ locale, namespace: `onboarding.${step}` });
  const { step: current, total } = progress(step, status.minor);
  const countries = step === 'identity' || step === 'guardian' ? countryOptions(locale) : [];
  return (
    <StepShell
      step={current}
      total={total}
      title={t('title')}
      lead={t('lead')}
      backPath={previousPath(step, status.minor)}
      resumeUntil={step === 'identity' ? null : formatResume(status.expiresAt, locale)}
      testId={`onboarding-step-${step}`}
    >
      {step === 'identity' ? (
        <IdentityForm saved={status.steps.identity} countries={countries} />
      ) : step === 'sport' ? (
        <SportForm saved={status.steps.sport} />
      ) : step === 'affiliation' ? (
        <AffiliationStep />
      ) : (
        <GuardianForm saved={status.steps.guardian} countries={countries} />
      )}
    </StepShell>
  );
}
