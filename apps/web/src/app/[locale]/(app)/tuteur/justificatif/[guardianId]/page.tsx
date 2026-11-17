import { Callout, SplitHeading } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../../auth/auth-metadata';
import { readChildren } from '../../../../../../guardian/guardian-api';
import { LinkUploadForm } from '../../../../../../guardian/link-upload-form';
import { Link } from '../../../../../../i18n/navigation';
import { toLogin } from '../../../../../../onboarding/load-draft';
import { GUARDIAN_SPACE_PATH } from '../../../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('guardian');

/** Dépôt du justificatif pour un rattachement en attente ou refusé (lot 1.7bc, EX-108 n° 2). */
export default async function GuardianLinkPage({
  params,
}: {
  readonly params: Promise<{ readonly guardianId: string }>;
}) {
  const locale = await rootLocale();
  const { guardianId } = await params;
  const t = await getTranslations({ locale, namespace: 'guardian.link' });
  const read = await readChildren();
  if (read.kind === 'unauthenticated') {
    toLogin(`${GUARDIAN_SPACE_PATH}/justificatif/${guardianId}`, locale);
  }
  const child =
    read.kind === 'ok' ? read.children.find((entry) => entry.guardianId === guardianId) : undefined;
  const open =
    child !== undefined &&
    (child.linkStatus === 'awaiting_documents' || child.linkStatus === 'rejected');
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-link-page">
      <SplitHeading as="h1" lead={t('title')} />
      {open ? (
        <>
          <p className="text-oz-text-muted">{t('lead', { firstName: child.firstName })}</p>
          <Callout tone="legal">{t('orderHint')}</Callout>
          <LinkUploadForm guardianId={guardianId} />
        </>
      ) : (
        <Callout testId="guardian-link-closed">{t('notReady')}</Callout>
      )}
      <Link href={GUARDIAN_SPACE_PATH} className="inline-flex min-h-11 items-center underline">
        {t('back')}
      </Link>
    </section>
  );
}
