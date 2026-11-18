import { Callout } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { AuthHeading } from '../../../../../auth/auth-heading';
import { loadOwn } from '../../../../../espace/load-own';
import { VisibilityForm } from '../../../../../espace/visibility-form';
import { isMinor } from '../../../../../guardian/minor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'espace.visibility' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** Visibilité de la fiche (EX-115) : le titulaire majeur ; un mineur voit qui la règle. */
export default async function EspaceVisibilityPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'espace.visibility' });
  const own = await loadOwn('/espace/visibilite', locale);
  const minor = own?.birthDate !== undefined && isMinor(own.birthDate);
  return (
    <section className="flex flex-col gap-6" data-testid="espace-visibility">
      <AuthHeading kicker={t('kicker')} title={t('title')} lead={t('lead')} />
      {own === null || own.ozId === undefined ? (
        <Callout testId="espace-visibility-unavailable">{t('unavailable')}</Callout>
      ) : minor ? (
        <Callout tone="legal" testId="espace-visibility-minor">
          {t('minor')}
        </Callout>
      ) : (
        <VisibilityForm ozId={own.ozId} initial={own.visibility ?? {}} />
      )}
    </section>
  );
}
