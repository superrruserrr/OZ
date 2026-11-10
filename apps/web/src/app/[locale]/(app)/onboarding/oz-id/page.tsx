import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { isValidElement } from 'react';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { redirect } from '../../../../../i18n/navigation';
import { formatResume, loadDraft } from '../../../../../onboarding/load-draft';
import { messageKey } from '../../../../../onboarding/field-message';
import { OzIdScreen } from '../../../../../onboarding/oz-id-screen';
import { StepShell } from '../../../../../onboarding/step-shell';
import {
  nextPath,
  OZ_ID_PATH,
  previousPath,
  progress,
  stepPath,
} from '../../../../../onboarding/steps';

export const generateMetadata = () => authMetadata('onboarding');

/** Dernière étape : récapitulatif, finalisation et carte OZ ID (EX-120). */
export default async function OnboardingOzIdPage() {
  const locale = await rootLocale();
  const draft = await loadDraft(OZ_ID_PATH);
  if (isValidElement(draft)) return draft;
  const status = draft;
  const { identity, sport } = status.steps;
  if (status.missing.length > 0) {
    redirect({ href: nextPath(status), locale });
    return null;
  }
  if (identity === null || sport === null) {
    // Réponse incohérente de l'API : jamais de redirection vers cet écran lui-même.
    redirect({ href: stepPath(identity === null ? 'identity' : 'sport'), locale });
    return null;
  }

  const t = await getTranslations({ locale, namespace: 'onboarding' });
  const country =
    new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' }).of(identity.country) ??
    identity.country;
  const position = t(`positions.${messageKey(sport.primaryPosition)}`);
  const birthDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${identity.birthDate}T00:00:00Z`),
  );
  const name = `${identity.firstName} ${identity.lastName}`;
  const { step, total } = progress('ozId', status.minor);
  return (
    <StepShell
      step={step}
      total={total}
      title={t('ozId.title')}
      lead={t('ozId.lead')}
      backPath={previousPath('ozId', status.minor)}
      resumeUntil={formatResume(status.expiresAt, locale)}
      testId="onboarding-step-oz-id"
    >
      <OzIdScreen
        name={name}
        details={[position, country]}
        summary={[
          { label: t('ozId.name'), value: name },
          { label: t('ozId.birthDate'), value: birthDate },
          { label: t('ozId.country'), value: country },
          { label: t('ozId.position'), value: position },
        ]}
      />
    </StepShell>
  );
}
