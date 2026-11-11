import { Badge, OzIdCard, PitchPositions, SportIcon, SportTag } from '@oz/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import type { ReactNode } from 'react';
import { Link } from '../../../../../i18n/navigation';
import { toLogin } from '../../../../../onboarding/load-draft';
import { CountryFlag, countryName } from '../../../../../players/country';
import { POSITION_SPOTS, positionKey } from '../../../../../players/labels';
import { PlayerAvatar } from '../../../../../players/player-avatar';
import { readPlayer } from '../../../../../players/players-api';
import { ProfileSections, type ProfileSection } from '../../../../../players/profile-sections';

interface Props {
  params: Promise<{ ozId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await rootLocale(), namespace: 'players' });
  // Aucune donnée de joueur dans les métadonnées ; fiche jamais indexée (EX-106 n° 3, EX-T16 n° 2).
  return { title: t('profile.ozId'), robots: { index: false, follow: false } };
}

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-oz-border py-3 last:border-b-0">
      <dt className="text-sm text-oz-text-label">{label}</dt>
      <dd className="flex items-center gap-2 text-right font-medium text-oz-text">{children}</dd>
    </div>
  );
}

/**
 * Fiche d'un joueur (lot 1.5dc, EX-115) : en-tête lisible d'un coup d'œil (sport, poste, pays avec
 * drapeau, niveau de vérification), puis des sections qui s'ouvrent au clic dans un volet. Le site
 * n'affiche que ce que l'API rend à ce lecteur ; une fiche hors de portée répond 404, sans indice.
 */
export default async function PlayerPage({ params }: Props) {
  const [{ ozId }, locale] = await Promise.all([params, rootLocale()]);
  const result = await readPlayer(ozId);
  if (result.kind === 'unauthenticated') toLogin(`/joueur/${ozId}`, locale);
  if (result.kind === 'not_found' || result.kind === 'forbidden') notFound();
  const [t, pos, feet] = await Promise.all([
    getTranslations({ locale, namespace: 'players' }),
    getTranslations({ locale, namespace: 'onboarding.positions' }),
    getTranslations({ locale, namespace: 'onboarding.sport.feet' }),
  ]);
  if (result.kind !== 'ok') {
    return (
      <p
        role="alert"
        className="mx-auto max-w-3xl rounded-2xl border border-oz-border bg-oz-surface-1 p-6 text-oz-text-muted"
        data-testid="player-unavailable"
      >
        {t('unavailable')}
      </p>
    );
  }
  const player = result.data;
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ');
  const hidden = <span className="font-normal text-oz-text-label">{t('profile.hidden')}</span>;
  const primary = player.primaryPosition ? pos(positionKey(player.primaryPosition)) : null;
  const secondary = player.secondaryPosition ? pos(positionKey(player.secondaryPosition)) : null;
  const level = player.verificationLevel;
  const levelLabel = level === undefined ? null : t(`levels.l${String(level) as '0' | '1' | '2'}`);
  const country = (code: string | undefined) =>
    code ? (
      <>
        <CountryFlag code={code} />
        {countryName(code, locale)}
      </>
    ) : (
      hidden
    );

  const sections: ProfileSection[] = [
    {
      id: 'identity',
      title: t('profile.identity.title'),
      summary: t('profile.identity.summary'),
      icon: (
        <svg {...stroke} aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" />
        </svg>
      ),
      content: (
        <>
          <dl>
            <Row label={t('profile.identity.nationality')}>{country(player.nationality)}</Row>
            <Row label={t('profile.identity.residence')}>{country(player.country)}</Row>
            <Row label={t('profile.identity.city')}>{player.city ?? hidden}</Row>
            <Row label={t('profile.identity.birthYear')}>
              {player.birthYear ?? player.birthDate?.slice(0, 4) ?? hidden}
            </Row>
          </dl>
          <p className="text-sm text-oz-text-label">{t('profile.identity.note')}</p>
        </>
      ),
    },
    {
      id: 'sport',
      title: t('profile.sport.title'),
      summary: t('profile.sport.summary'),
      icon: <SportIcon sport="football" />,
      content: (
        <>
          <dl>
            <Row label={t('profile.sport.sport')}>
              <SportTag sport="football" label={t('sport')} />
            </Row>
            <Row label={t('profile.sport.primary')}>{primary ?? hidden}</Row>
            <Row label={t('profile.sport.secondary')}>{secondary ?? hidden}</Row>
            <Row label={t('profile.sport.foot')}>
              {player.dominantFoot ? feet(player.dominantFoot) : hidden}
            </Row>
          </dl>
          {player.primaryPosition && primary ? (
            <PitchPositions
              title={t('profile.sport.pitch')}
              primary={POSITION_SPOTS[player.primaryPosition]}
              secondary={
                player.secondaryPosition && player.secondaryPosition !== player.primaryPosition
                  ? [POSITION_SPOTS[player.secondaryPosition]]
                  : []
              }
              labels={{ primary, secondary: secondary ? [secondary] : [] }}
            />
          ) : null}
        </>
      ),
    },
    {
      id: 'physical',
      title: t('profile.physical.title'),
      summary: t('profile.physical.summary'),
      icon: (
        <svg {...stroke} aria-hidden="true">
          <path d="M6 3v18M6 7h4M6 12h6M6 17h4M16 5v14M13 8l3-3 3 3M13 16l3 3 3-3" />
        </svg>
      ),
      content: (
        <>
          <dl>
            <Row label={t('profile.physical.height')}>
              {player.heightCm
                ? t('profile.physical.cm', { value: String(player.heightCm) })
                : hidden}
            </Row>
            <Row label={t('profile.physical.weight')}>
              {player.weightKg
                ? t('profile.physical.kg', { value: String(player.weightKg) })
                : hidden}
            </Row>
          </dl>
          <p className="text-sm text-oz-text-label">{t('profile.physical.note')}</p>
        </>
      ),
    },
    {
      id: 'verification',
      title: t('profile.verification.title'),
      summary: t('profile.verification.summary'),
      icon: (
        <svg {...stroke} aria-hidden="true">
          <path d="M12 3l7 3v5.5c0 4.5-3 7.6-7 9.5-4-1.9-7-5-7-9.5V6z" />
          <path d="M9 12l2.2 2.2L15.2 10" />
        </svg>
      ),
      content: (
        <>
          <dl>
            <Row label={t('profile.verification.level')}>{levelLabel ?? hidden}</Row>
          </dl>
          <ol className="flex flex-col gap-3">
            {([0, 1, 2] as const).map((step) => {
              const done = level !== undefined && level >= step;
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      done
                        ? 'grid size-6 shrink-0 place-items-center rounded-full bg-oz-primary text-oz-on-primary'
                        : 'size-6 shrink-0 rounded-full border border-oz-border'
                    }
                  >
                    {done ? (
                      <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                        <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    ) : null}
                  </span>
                  <span className={done ? 'text-oz-text' : 'text-oz-text-label'}>
                    {t(`profile.verification.steps.l${String(step) as '0' | '1' | '2'}`)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="text-sm text-oz-text-label">{t('profile.verification.note')}</p>
        </>
      ),
    },
    {
      id: 'card',
      title: t('profile.card.title'),
      summary: t('profile.card.summary'),
      icon: (
        <svg {...stroke} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M7 10h4M7 14h7M16 9.5h1.5v1.5H16z" />
        </svg>
      ),
      content: (
        <>
          <OzIdCard
            name={name || (player.ozId ?? '')}
            ozId={player.ozId ?? ''}
            ozIdLabel={t('profile.ozId')}
            details={[primary, player.country ? countryName(player.country, locale) : null]}
            badge={
              levelLabel ? (
                <Badge tone={level === 2 ? 'verified' : 'neutral'} filled>
                  {levelLabel}
                </Badge>
              ) : undefined
            }
          />
          <p className="text-sm text-oz-text-label">{t('profile.card.note')}</p>
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8" data-testid="player-profile">
      <Link
        href="/recherche"
        data-testid="player-back"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-oz-text-muted hover:text-oz-text"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden="true">
          <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.75" />
        </svg>
        {t('back')}
      </Link>
      <header className="relative overflow-hidden rounded-3xl border border-oz-border bg-oz-surface-1 p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-radial from-oz-primary/15 to-transparent to-70%"
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <PlayerAvatar firstName={player.firstName} lastName={player.lastName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-oz-text sm:text-4xl">
              {name || player.ozId}
            </h1>
            <p
              className="mt-2 font-mono text-sm tracking-[0.05em] text-oz-primary"
              data-testid="player-oz-id"
            >
              {player.ozId}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SportTag sport="football" label={t('sport')} />
              {primary ? (
                <span className="inline-flex h-7 items-center rounded-full border border-oz-border bg-oz-surface-2 px-3 text-xs font-medium text-oz-text">
                  {primary}
                </span>
              ) : null}
              {player.country ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-oz-border bg-oz-surface-2 px-3 text-xs font-medium text-oz-text">
                  <CountryFlag code={player.country} />
                  {countryName(player.country, locale)}
                </span>
              ) : null}
              {levelLabel ? (
                <Badge tone={level === 2 ? 'verified' : 'neutral'} filled>
                  {levelLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <section aria-labelledby="sections" className="flex flex-col gap-4">
        <div>
          <h2 id="sections" className="font-display text-xl font-medium">
            {t('profile.sectionsTitle')}
          </h2>
          <p className="mt-1 text-sm text-oz-text-muted">{t('profile.sectionsHint')}</p>
        </div>
        <ProfileSections
          sections={sections}
          openLabel={t('profile.openSection')}
          closeLabel={t('profile.close')}
        />
      </section>
    </div>
  );
}
