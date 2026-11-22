import type { PlayerProfileOutput } from '@oz/contracts';
import { Badge, ClubCrest, MeasureBar, MediaFrame } from '@oz/ui';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Link } from '../i18n/navigation';
import { profileCompleteness } from './completeness';
import { CountryFlag } from '../players/country';
import { DASHBOARD_ICONS } from './icons';

/* Aptitudes que mesureront les Centres OZ Performance (Source A, Phase 2) : axes seulement. */
const APTITUDES = ['speed', 'endurance', 'jump', 'agility', 'strength', 'technique'] as const;

const arrow = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const VISIBILITY_BLOCKS = ['location', 'physical', 'sport', 'photos'] as const;

const card =
  'relative flex min-w-0 flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 shadow-[0_0_48px_-28px_var(--oz-primary)] sm:p-6';
const more =
  'inline-flex min-h-11 items-center gap-1 text-sm font-medium text-oz-primary underline-offset-4 hover:underline';
const action =
  'inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-oz-primary/50 px-4 text-sm font-medium text-oz-primary hover:bg-oz-primary/10';

function Step({ n }: { readonly n: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-oz-primary text-sm font-medium text-oz-on-primary"
    >
      {n}
    </span>
  );
}

function CardTitle({
  n,
  title,
  aside,
}: {
  readonly n?: number;
  readonly title: string;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {n === undefined ? null : <Step n={n} />}
      <h2 className="text-lg font-medium text-oz-text">{title}</h2>
      {aside ? <span className="ml-auto">{aside}</span> : null}
    </div>
  );
}

const initials = (profile: Partial<PlayerProfileOutput>) =>
  [profile.firstName, profile.lastName]
    .map((part) => part?.trim().charAt(0).toUpperCase() ?? '')
    .join('') || 'OZ';

export interface PlayerDashboardProps {
  readonly profile: Partial<PlayerProfileOutput>;
  /** QR du profil en image `data:` (généré par le serveur du site), ou `null` sans adresse publique. */
  readonly qr?: string | null;
  /** Libellés déjà traduits du poste et du pays. */
  readonly position?: string | null;
  readonly country?: string | null;
  /** Photo de profil saine (lot 1.19cd), relayée par le site ; sinon les initiales. */
  readonly photoId?: string | null;
}

/*
 * Tableau de bord du joueur, v2 d'après la maquette du 2026-11-18 (lots 1.5ec, 1.19b). Seulement des
 * données réelles de sa fiche (`GET /players/me`) : identité, complétude, visibilité, OZ ID et QR.
 * Performances, activités, statistiques et vidéos restent « Bientôt disponible », sans valeur
 * inventée (Q18, E4) ; l'illustration est dessinée, sans visage (EX-T16).
 */
export function PlayerDashboard({
  profile,
  qr = null,
  position,
  country,
  photoId = null,
}: PlayerDashboardProps) {
  const t = useTranslations('dashboard');
  const completeness = profileCompleteness(profile);
  const percent =
    completeness.total === 0 ? 0 : Math.round((completeness.filled / completeness.total) * 100);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const visible = VISIBILITY_BLOCKS.filter((block) => profile.visibility?.[block] !== false).length;
  const soon = (
    <Badge tone="neutral" filled>
      {t('soonBadge')}
    </Badge>
  );
  return (
    <div className="flex flex-col gap-6" data-testid="player-dashboard">
      {/* Héros : salutation et carte d'identité, illustration à droite (≥ 768 px). */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-8">
        {/* Stade vide la nuit (photo libre sans visage, docs/legal/credits.md), AVIF ou WebP. */}
        <Image
          src="/images/sport/stade-nuit.jpg"
          alt=""
          data-testid="dashboard-hero-photo"
          fill
          priority
          sizes="(min-width: 1024px) 72rem, 100vw"
          className="pointer-events-none -z-20 object-cover opacity-35"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-oz-surface-1 via-oz-surface-1/85 to-oz-surface-1/30"
        />
        <div className="flex max-w-2xl flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[clamp(2rem,3.2vw+1rem,3.25rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-oz-text">
              {t('helloLead')}
              {profile.firstName ? (
                <>
                  {' '}
                  <span className="text-oz-accent">
                    {t('helloName', { name: profile.firstName })}
                  </span>
                </>
              ) : null}{' '}
              <span aria-hidden="true">{t('wave')}</span>
            </h1>
            <p className="text-base text-oz-text-muted sm:text-lg">{t('lead')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-oz-border bg-oz-bg/70 p-4 supports-backdrop-filter:backdrop-blur-md">
            {photoId ? (
              <Image
                src={`/api/photos?joueur=me&id=${encodeURIComponent(photoId)}`}
                alt=""
                width={56}
                height={56}
                unoptimized
                data-testid="dashboard-photo"
                className="size-14 shrink-0 rounded-full border-2 border-oz-primary object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-oz-primary text-lg font-medium text-oz-primary"
              >
                {initials(profile)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate font-medium text-oz-text" data-testid="dashboard-name">
                {name}
              </p>
              {position || country ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-oz-text-muted">
                  {position ? <span>{position}</span> : null}
                  {position && country ? (
                    <span aria-hidden="true" className="size-1 rounded-full bg-oz-text-label" />
                  ) : null}
                  {country ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      data-testid="dashboard-country"
                    >
                      {profile.country ? (
                        <CountryFlag code={profile.country} className="h-3.5 w-5 rounded-sm" />
                      ) : null}
                      {country}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {/* Écusson générique (aucun logo réel) : club rattaché, ou joueur libre. */}
              <p
                className="flex items-center gap-2 text-sm text-oz-text-muted"
                data-testid="dashboard-club"
              >
                <ClubCrest name={profile.organizationId ?? 'OZ'} decorative className="h-6" />
                {profile.organizationId ? t('club.attached') : t('club.free')}
              </p>
              {profile.ozId ? (
                <p className="font-mono text-sm text-oz-primary">{profile.ozId}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              <Badge tone="neutral" status="declared" filled>
                {t('declared')}
              </Badge>
              {profile.ozId ? (
                <Link
                  href={`/joueur/${profile.ozId}`}
                  className={action}
                  data-testid="dashboard-view-profile"
                >
                  {t('viewProfile')}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Profil OZ : complétude réelle, champ par champ. */}
        <section className={card} data-testid="dashboard-profile">
          <CardTitle
            n={1}
            title={t('profile.title')}
            aside={
              <span className="text-2xl font-medium text-oz-text">
                {t('percent', { value: percent })}
              </span>
            }
          />
          <MeasureBar
            label={t('profile.gauge')}
            value={percent}
            max={100}
            valueText={t('percent', { value: percent })}
            segmented
            testId="dashboard-completeness"
          />
          <p className="text-sm text-oz-text">
            {t('profile.fields', { filled: completeness.filled, total: completeness.total })}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={t('profile.radar')}>
            {completeness.rubrics.map((rubric) => (
              <li key={rubric.key} className="flex items-center gap-1.5 text-oz-text-muted">
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${rubric.percent === 100 ? 'bg-oz-primary' : rubric.percent > 0 ? 'bg-oz-kyc' : 'bg-oz-text-disabled'}`}
                />
                {t(`rubrics.${rubric.key}`)}
                <span className="sr-only">{t('percent', { value: rubric.percent })}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-oz-text-label">{t('profile.note')}</p>
          <Link
            href="/espace/profil"
            data-testid="dashboard-complete-profile"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-oz-primary/60 text-sm font-medium text-oz-primary hover:bg-oz-primary/10"
          >
            {t('profile.complete')}
            {arrow}
          </Link>
        </section>

        {/* 2. Performances : axes seulement, en attente de mesures certifiées (E4). */}
        <section className={card} data-testid="dashboard-performances">
          <CardTitle
            n={2}
            title={t('aptitudes.title')}
            aside={
              <span className="flex items-center gap-3">
                {soon}
                <Link
                  href="/espace/performances"
                  className={more}
                  data-testid="dashboard-to-performances"
                >
                  {t('aptitudes.more')}
                  {arrow}
                </Link>
              </span>
            }
          />
          <p className="text-sm text-oz-text-muted">{t('aptitudes.empty')}</p>
          <figure aria-label={t('aptitudes.title')} data-state="empty">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
              {APTITUDES.map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between border-b border-oz-border pb-2 text-sm"
                >
                  <span className="text-oz-text">{t(`aptitudes.axes.${key}`)}</span>
                  <span aria-hidden="true" className="h-px w-3 bg-oz-text-label" />
                </li>
              ))}
            </ul>
          </figure>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* 3. Visibilité : état réel des blocs. */}
        <section className={card} data-testid="dashboard-visibility">
          <CardTitle n={3} title={t('visibility.title')} />
          <p className="flex items-center gap-3 text-sm text-oz-text-muted">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-full border border-oz-primary/40 text-oz-primary [&>svg]:size-5"
            >
              {DASHBOARD_ICONS.eye}
            </span>
            {t('visibility.state', { visible, total: VISIBILITY_BLOCKS.length })}
          </p>
          <Link href="/espace/visibilite" className={action} data-testid="dashboard-to-visibility">
            {t('visibility.edit')}
          </Link>
        </section>

        {/* 4. OZ ID et QR, relus sur l'API (D-133). */}
        <section className={card} data-testid="onboarding-own-card">
          <CardTitle n={4} title={t('ozId.title')} />
          <p className="font-mono text-base font-medium whitespace-nowrap text-oz-primary sm:text-lg">
            {profile.ozId}
          </p>
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 text-sm text-oz-text-muted">{t('ozId.lead')}</p>
            {qr && profile.ozId ? (
              <Image
                unoptimized
                src={qr}
                alt={t('ozId.qr', { ozId: profile.ozId })}
                width={104}
                height={104}
                className="size-26 shrink-0 rounded-xl border-4 border-oz-primary bg-white p-1"
                data-testid="oz-id-qr"
              />
            ) : null}
          </div>
          <Link href="/onboarding/oz-id" className={action} data-testid="dashboard-to-card">
            {t('ozId.card')}
            {arrow}
          </Link>
        </section>

        {/* Activités récentes : rien d'inventé tant que les vues ne sont pas tracées. */}
        <section className={card} data-testid="dashboard-activity">
          <CardTitle title={t('activity.title')} aside={soon} />
          <p className="text-sm text-oz-text-muted">{t('activity.empty')}</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Statistiques : cadre vide, aucune courbe sans mesure réelle. */}
        <section className={card} data-testid="dashboard-stats">
          <CardTitle
            title={t('stats.title')}
            aside={
              <span className="flex items-center gap-3">
                {soon}
                <Link href="/espace/performances" className={more} data-testid="dashboard-to-stats">
                  {t('aptitudes.more')}
                  {arrow}
                </Link>
              </span>
            }
          />
          <div className="relative h-40 rounded-xl border border-dashed border-oz-border bg-[linear-gradient(to_top,var(--oz-border)_1px,transparent_1px)] bg-size-[100%_25%]">
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-oz-text-muted">
              {t('stats.empty')}
            </p>
          </div>
        </section>

        {/* Portfolio vidéo : cadres vides au format 16:9. */}
        <section className={card} data-testid="dashboard-videos">
          <CardTitle
            title={t('videos.title')}
            aside={
              <span className="flex items-center gap-3">
                {soon}
                <Link href="/espace/videos" className={more} data-testid="dashboard-to-videos">
                  {t('videos.more')}
                  {arrow}
                </Link>
              </span>
            }
          />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
              <MediaFrame key={index} ratio="16:9" testId={`dashboard-video-${String(index)}`} />
            ))}
          </div>
          <p className="text-sm text-oz-text-muted">{t('videos.empty')}</p>
        </section>
      </div>
    </div>
  );
}
