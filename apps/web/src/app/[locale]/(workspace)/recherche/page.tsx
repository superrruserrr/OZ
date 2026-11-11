import { Button, Kicker, SplitHeading } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { Link } from '../../../../i18n/navigation';
import { toLogin } from '../../../../onboarding/load-draft';
import { COUNTRY_CODES } from '../../../../onboarding/countries';
import { countryName } from '../../../../players/country';
import { positionKey } from '../../../../players/labels';
import { PlayerCard } from '../../../../players/player-card';
import {
  criteriaQuery,
  parseCriteria,
  SEARCH_POSITIONS,
  searchPlayers,
} from '../../../../players/players-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'players' });
  // Jamais indexé : annuaire réservé aux comptes connectés (EX-106 n° 3).
  return { title: t('title'), robots: { index: false, follow: false } };
}

const fieldClass =
  'h-12 w-full rounded-xl border border-oz-border bg-oz-surface-input px-3 text-base text-oz-text outline-none focus-visible:border-oz-primary';

/**
 * Annuaire des joueurs (lot 1.5dc, EX-116 n° 1) : formulaire GET sans script (les critères vivent dans
 * l'adresse), résultats par pages à curseur. Les droits sont ceux de l'API : rien n'est filtré ni
 * complété par le site.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await rootLocale();
  const criteria = parseCriteria(await searchParams);
  const [t, pos, result] = await Promise.all([
    getTranslations({ locale, namespace: 'players' }),
    getTranslations({ locale, namespace: 'onboarding.positions' }),
    searchPlayers(criteria),
  ]);
  if (result.kind === 'unauthenticated') toLogin('/recherche', locale);

  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort(
    (a, b) => a.name.localeCompare(b.name, locale),
  );
  const filters = { q: criteria.q, position: criteria.position, country: criteria.country };
  const hasFilters = criteriaQuery(filters) !== '';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col items-start gap-4">
        <Kicker>{t('kicker')}</Kicker>
        <SplitHeading as="h1" lead={t('title')} />
        <p className="max-w-2xl text-oz-text-muted">{t('lead')}</p>
      </header>

      <form
        method="get"
        role="search"
        data-testid="player-search-form"
        className="grid gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-oz-text-label">
          {t('searchLabel')}
          <input
            type="search"
            name="q"
            defaultValue={criteria.q ?? ''}
            maxLength={80}
            aria-describedby="search-hint"
            data-testid="player-search-q"
            className={fieldClass}
          />
          <span id="search-hint" className="text-xs font-normal text-oz-text-label">
            {t('searchHint')}
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-oz-text-label">
          {t('position')}
          <select
            name="position"
            defaultValue={criteria.position ?? ''}
            data-testid="player-search-position"
            className={fieldClass}
          >
            <option value="">{t('anyPosition')}</option>
            {SEARCH_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {pos(positionKey(position))}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="text-xs">
            &nbsp;
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-oz-text-label">
          {t('country')}
          <select
            name="country"
            defaultValue={criteria.country ?? ''}
            data-testid="player-search-country"
            className={fieldClass}
          >
            <option value="">{t('anyCountry')}</option>
            {countries.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="text-xs">
            &nbsp;
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <Button type="submit" size="sm" className="h-12" data-testid="player-search-submit">
            {t('submit')}
          </Button>
          <span aria-hidden="true" className="text-xs">
            &nbsp;
          </span>
        </div>
      </form>

      {result.kind === 'forbidden' ? (
        <section
          className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6"
          data-testid="player-search-forbidden"
        >
          <h2 className="font-display text-xl font-medium">{t('forbiddenTitle')}</h2>
          <p className="mt-2 text-oz-text-muted">{t('forbidden')}</p>
        </section>
      ) : null}
      {result.kind === 'unavailable' || result.kind === 'not_found' ? (
        <p
          role="alert"
          className="rounded-2xl border border-oz-border bg-oz-surface-1 p-6 text-oz-text-muted"
          data-testid="player-search-unavailable"
        >
          {t('unavailable')}
        </p>
      ) : null}
      {result.kind === 'ok' ? (
        <section aria-labelledby="resultats" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resultats" className="font-display text-xl font-medium">
              {t('results')}
            </h2>
            {hasFilters ? (
              <Link
                href="/recherche"
                data-testid="player-search-reset"
                className="inline-flex min-h-11 items-center text-sm font-medium text-oz-primary underline-offset-4 hover:underline"
              >
                {t('reset')}
              </Link>
            ) : null}
          </div>
          {result.data.items.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-oz-border p-8 text-center"
              data-testid="player-search-empty"
            >
              <p className="font-medium text-oz-text">{t('empty')}</p>
              <p className="mt-1 text-sm text-oz-text-muted">{t('emptyHint')}</p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {result.data.items.map((player) => (
                <li key={player.ozId ?? player.id}>
                  <PlayerCard
                    player={player}
                    labels={{
                      sport: t('sport'),
                      open: t('open'),
                      born: player.birthYear ? t('born', { year: String(player.birthYear) }) : null,
                      position: player.primaryPosition
                        ? pos(positionKey(player.primaryPosition))
                        : null,
                      country: player.country ? countryName(player.country, locale) : null,
                      level:
                        player.verificationLevel === undefined
                          ? null
                          : t(`levels.l${String(player.verificationLevel) as '0' | '1' | '2'}`),
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {criteria.cursor ? (
              <Link
                href={`/recherche${hasFilters ? `?${criteriaQuery(filters)}` : ''}`}
                data-testid="player-search-first"
                className="inline-flex min-h-11 items-center text-sm font-medium text-oz-text-muted underline-offset-4 hover:underline"
              >
                {t('first')}
              </Link>
            ) : (
              <span />
            )}
            {result.data.nextCursor ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/recherche?${criteriaQuery({ ...filters, cursor: result.data.nextCursor })}`}
                  data-testid="player-search-next"
                >
                  {t('next')}
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
