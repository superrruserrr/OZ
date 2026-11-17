import { Callout } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { ConsentPanel } from '../../../../../../guardian/consent-panel';
import { readChildren, readConsentText } from '../../../../../../guardian/guardian-api';
import { Link } from '../../../../../../i18n/navigation';
import { toLogin } from '../../../../../../onboarding/load-draft';
import { GUARDIAN_SPACE_PATH } from '../../../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('guardian');

/** Accords du tuteur au lien validé pour un enfant (lot 1.7bc, EX-108 n° 3 à 5, CP-13, R5). */
export default async function GuardianConsentPage({
  params,
}: {
  readonly params: Promise<{ readonly ozId: string }>;
}) {
  const locale = await rootLocale();
  const { ozId } = await params;
  const t = await getTranslations({ locale, namespace: 'guardian.consent' });
  const tLink = await getTranslations({ locale, namespace: 'guardian.link' });
  const read = await readChildren();
  if (read.kind === 'unauthenticated') toLogin(`${GUARDIAN_SPACE_PATH}/accords/${ozId}`, locale);
  const child =
    read.kind === 'ok'
      ? read.children.find((entry) => entry.ozId === ozId && entry.linkStatus === 'approved')
      : undefined;
  const back = (
    <Link href={GUARDIAN_SPACE_PATH} className="inline-flex min-h-11 items-center underline">
      {tLink('back')}
    </Link>
  );
  if (child === undefined) {
    return (
      <section className="flex flex-col gap-6" data-testid="guardian-consent-page">
        <Callout testId="guardian-consent-closed">{t('notReady')}</Callout>
        {back}
      </section>
    );
  }
  const [data, publication] = await Promise.all([
    readConsentText('guardian_data_processing'),
    readConsentText('guardian_profile_publication'),
  ]);
  const hasData = child.consents.includes('guardian_data_processing');
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-consent-page">
      <div>
        <h1 className="font-display text-3xl font-bold">
          {t('title', { firstName: child.firstName })}
        </h1>
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      {child.guardianVerified ? null : (
        <Callout tone="legal" testId="guardian-consent-kyc">
          {t('kycNotice')}
        </Callout>
      )}
      {data === null || publication === null ? (
        <Callout testId="guardian-consent-unavailable">{t('unavailable')}</Callout>
      ) : (
        <>
          <ConsentPanel ozId={ozId} text={data} active={hasData} />
          <ConsentPanel
            ozId={ozId}
            text={publication}
            active={child.consents.includes('guardian_profile_publication')}
            blockedBy={hasData ? undefined : 'requiresData'}
          />
        </>
      )}
      {back}
    </section>
  );
}
