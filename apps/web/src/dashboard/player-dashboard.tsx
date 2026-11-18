import type { PlayerProfileOutput } from '@oz/contracts';
import { AttributeRadar, Badge, GaugeDial, HudFrame, SplitHeading } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';
import { ComingSoonGrid } from './coming-soon';
import { profileCompleteness } from './completeness';
import { DASHBOARD_ICONS } from './icons';

/* Aptitudes que mesureront les Centres OZ Performance (Source A, Phase 2) : axes seulement. */
const APTITUDES = ['speed', 'endurance', 'jump', 'agility', 'strength', 'technique'] as const;

const SOON = [
  { key: 'views', icon: DASHBOARD_ICONS.eye },
  { key: 'videos', icon: DASHBOARD_ICONS.video },
  { key: 'messages', icon: DASHBOARD_ICONS.message },
  { key: 'evaluations', icon: DASHBOARD_ICONS.stopwatch },
] as const;

/*
 * Tableau de bord du joueur (lot 1.5ec, E3, E4) : seulement des données réelles de sa fiche
 * (`GET /players/me`). L'hexagone de complétude compte les champs renseignés ; celui des aptitudes
 * reste vide tant qu'aucune mesure certifiée n'existe. Les fonctions à venir sont des cartes
 * désactivées « Bientôt disponible », remplies par leurs lots (1.19, Phase 2).
 */
export function PlayerDashboard({ profile }: { profile: Partial<PlayerProfileOutput> }) {
  const t = useTranslations('dashboard');
  const completeness = profileCompleteness(profile);
  const level = profile.verificationLevel ?? 0;
  return (
    <div className="flex flex-col gap-6" data-testid="player-dashboard">
      <header className="flex flex-col gap-3">
        <SplitHeading
          as="h1"
          lead={profile.firstName ? t('hello', { name: profile.firstName }) : t('helloAnonymous')}
        />
        <p className="text-oz-text-muted">{t('lead')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {profile.ozId ? (
            <span className="rounded-lg border border-oz-border px-2.5 py-1 font-mono text-sm text-oz-text">
              {profile.ozId}
            </span>
          ) : null}
          <Badge tone={level >= 1 ? 'verified' : 'neutral'} filled>
            {t(`level.l${String(level) as '0' | '1' | '2'}`)}
          </Badge>
        </div>
        {profile.ozId ? (
          <Link
            href={`/joueur/${profile.ozId}`}
            className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-oz-primary underline-offset-4 hover:underline"
          >
            {t('viewProfile')}
          </Link>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <HudFrame title={t('profile.title')} kicker={t('profile.kicker')} illustration="pitch">
          <AttributeRadar
            label={t('profile.radar')}
            axes={completeness.rubrics.map((rubric) => ({
              key: rubric.key,
              label: t(`rubrics.${rubric.key}`),
              value: rubric.percent,
              valueText: t('percent', { value: rubric.percent }),
            }))}
          />
          <GaugeDial
            label={t('profile.gauge')}
            value={completeness.filled}
            max={completeness.total}
            valueText={t('profile.fields', {
              filled: completeness.filled,
              total: completeness.total,
            })}
          />
          <p className="text-xs text-oz-text-label">{t('profile.note')}</p>
        </HudFrame>

        <HudFrame
          title={t('aptitudes.title')}
          kicker={t('aptitudes.kicker')}
          illustration="hex"
          aside={
            <Badge tone="neutral" filled>
              {t('soonBadge')}
            </Badge>
          }
        >
          <AttributeRadar
            label={t('aptitudes.title')}
            emptyText={t('aptitudes.empty')}
            axes={APTITUDES.map((key) => ({ key, label: t(`aptitudes.axes.${key}`), value: null }))}
          />
        </HudFrame>
      </div>

      <ComingSoonGrid
        title={t('soonTitle')}
        badge={t('soonBadge')}
        items={SOON.map((item) => ({
          key: item.key,
          icon: item.icon,
          title: t(`soon.${item.key}.title`),
          text: t(`soon.${item.key}.text`),
        }))}
      />
    </div>
  );
}
