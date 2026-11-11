import { Kicker, SplitHeading } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { ContactSection } from '../../../../contact/contact-section';
import { pageMetadata } from '../../../../site/metadata';
import { SiteSection } from '../../../../site/site-section';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'contactPage' });
  return pageMetadata(locale, '/contact', t('title'), t('lead'));
}

/** Contact (lot 1.6, EX-106 n° 1) : formulaire validé dans le navigateur puis par le serveur. */
export default async function ContactPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'contactPage' });
  return (
    <SiteSection>
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        <div className="flex max-w-md flex-col items-start gap-5">
          <Kicker>{t('kickerLabel')}</Kicker>
          <SplitHeading as="h1" size="hero" lead={t('title')} />
          <p className="text-oz-text-muted">{t('lead')}</p>
        </div>
        <div className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6 sm:p-8">
          <ContactSection />
        </div>
      </section>
    </SiteSection>
  );
}
