import { Callout } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { DeletionPanel, ExportPanel } from '../../../../../espace/data-panels';
import { readDeletionStatus, readExportStatus } from '../../../../../espace/espace-api';
import { loadOwn } from '../../../../../espace/load-own';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'espace.data' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** Mes données (EX-118) : export et suppression du compte, ré-authentifiés. */
export default async function EspaceDataPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'espace.data' });
  await loadOwn('/espace/donnees', locale);
  const [latest, pending] = await Promise.all([readExportStatus(), readDeletionStatus()]);
  return (
    <section className="flex flex-col gap-6" data-testid="espace-data">
      <AuthHeading kicker={t('kicker')} title={t('title')} lead={t('lead')} />
      {latest === undefined || pending === undefined ? (
        <Callout testId="espace-data-unavailable">{t('unavailable')}</Callout>
      ) : (
        <>
          <ExportPanel initial={latest} />
          <DeletionPanel initial={pending} />
        </>
      )}
    </section>
  );
}
