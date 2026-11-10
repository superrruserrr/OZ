import { Callout } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { pageMetadata } from '../../../../site/metadata';
import { ORG_PLANS, PLAYER_PLANS } from '../../../../site/pricing';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return pageMetadata(locale, '/tarifs', t('title'), t('lead'));
}

const cell = 'border-b border-oz-border p-3 align-top';

/** Tarifs (lot 1.6, EX-106 n° 1, D3) : grille provisoire, joueur toujours gratuit, aucun paiement. */
export default async function PricingPage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const n = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB');
  const price = (value: number) => (value === 0 ? t('free') : n.format(value));
  const limit = (value: number | null) => (value === null ? t('unlimited') : n.format(value));
  return (
    <article className="max-w-4xl">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="mt-4 text-lg text-oz-text-muted">{t('lead')}</p>
      <Callout tone="info" testId="pricing-provisional" className="mt-6">
        {t('provisional')}
      </Callout>

      <h2 className="mt-10 font-display text-xl font-bold">{t('players')}</h2>
      <div className="mt-3 overflow-x-auto" role="region" aria-label={t('players')} tabIndex={0}>
        <table
          className="w-full min-w-[30rem] border-collapse text-left text-sm"
          data-testid="pricing-players"
        >
          <thead>
            <tr>
              <th scope="col" className={cell}>
                {t('plan')}
              </th>
              <th scope="col" className={cell}>
                {t('perMonthXaf')}
              </th>
              <th scope="col" className={cell}>
                {t('perMonthEur')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAYER_PLANS.map((plan) => (
              <tr key={plan.key}>
                <th scope="row" className={`${cell} font-semibold`}>
                  {t(`plans.${plan.key}`)}
                  <span className="block font-normal text-oz-text-muted">
                    {t(`desc.${plan.key}`)}
                  </span>
                </th>
                <td className={cell}>{price(plan.xaf)}</td>
                <td className={cell}>{price(plan.eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-xl font-bold">{t('organisations')}</h2>
      <div
        className="mt-3 overflow-x-auto"
        role="region"
        aria-label={t('organisations')}
        tabIndex={0}
      >
        <table
          className="w-full min-w-[36rem] border-collapse text-left text-sm"
          data-testid="pricing-organisations"
        >
          <thead>
            <tr>
              <th scope="col" className={cell}>
                {t('plan')}
              </th>
              <th scope="col" className={cell}>
                {t('perMonthXaf')}
              </th>
              <th scope="col" className={cell}>
                {t('perMonthEur')}
              </th>
              <th scope="col" className={cell}>
                {t('managed')}
              </th>
              <th scope="col" className={cell}>
                {t('users')}
              </th>
              <th scope="col" className={cell}>
                {t('exports')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ORG_PLANS.map((plan) => (
              <tr key={plan.key}>
                <th scope="row" className={`${cell} font-semibold`}>
                  {t(`plans.${plan.key}`)}
                </th>
                <td className={cell}>{price(plan.xaf)}</td>
                <td className={cell}>{price(plan.eur)}</td>
                <td className={cell}>{limit(plan.managed)}</td>
                <td className={cell}>{limit(plan.users)}</td>
                <td className={cell}>{n.format(plan.exportsPerDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-sm text-oz-text-muted">{t('federations')}</p>
      <p className="mt-2 text-sm text-oz-text-muted">{t('annual')}</p>
    </article>
  );
}
