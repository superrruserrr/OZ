import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { ContactSection } from '../../../../contact/contact-section';
import { pageMetadata } from '../../../../site/metadata';

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
    <section className="max-w-xl">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="mt-4 text-oz-text-muted">{t('lead')}</p>
      <div className="mt-8">
        <ContactSection />
      </div>
    </section>
  );
}
