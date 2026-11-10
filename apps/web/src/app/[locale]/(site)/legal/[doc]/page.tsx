import { Callout } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { loadLegalDoc } from '../../../../../legal/load';
import { Markdown } from '../../../../../legal/markdown';
import { pageMetadata } from '../../../../../site/metadata';
import { isLegalDoc, legalHref } from '../../../../../site/routes';
import { localizedPath } from '../../../../../site/metadata';

interface Props {
  params: Promise<{ doc: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) return {};
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'legal' });
  return pageMetadata(locale, `/legal/${doc}`, t(`titles.${doc}`), t('provisional'));
}

/*
 * Mentions légales, politique de confidentialité, CGU (lot 1.6, EX-106 n° 1 et 5) : textes
 * provisoires de `docs/legal/`, note de statut interne remplacée par un bandeau public. Français
 * seul ; avis en anglais sur `/en`.
 */
export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  const locale = await rootLocale();
  const [t, source] = await Promise.all([
    getTranslations({ locale, namespace: 'legal' }),
    loadLegalDoc(doc),
  ]);
  return (
    <article lang="fr" className="max-w-3xl" data-testid={`legal-${doc}`}>
      <div className="mb-6 flex flex-col gap-3" lang={locale}>
        <Callout tone="legal" testId="legal-provisional">
          {t('provisional')}
        </Callout>
        {locale === 'fr' ? null : <p className="text-sm text-oz-text-muted">{t('frenchOnly')}</p>}
      </div>
      <Markdown
        source={source}
        skipLeadingQuote
        resolveHref={(href) => {
          const target = legalHref(href);
          return target ? localizedPath(locale, target) : undefined;
        }}
      />
    </article>
  );
}
