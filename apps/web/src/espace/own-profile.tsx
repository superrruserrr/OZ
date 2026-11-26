import type { PlayerProfileOutput } from '@oz/contracts';
import { Badge, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Link } from '../i18n/navigation';

const card = 'flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6';

function Block({
  title,
  rows,
  missing,
}: {
  readonly title: string;
  readonly rows: readonly [string, ReactNode][];
  readonly missing: string;
}) {
  return (
    <section aria-label={title} className={card}>
      <h2 className="text-lg font-medium text-oz-text">{title}</h2>
      <dl className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-oz-border py-2.5 text-sm last:border-b-0"
          >
            <dt className="text-oz-text-muted">{label}</dt>
            <dd className={value ? 'text-right text-oz-text' : 'text-right text-oz-text-label'}>
              {value || missing}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Mon profil (maquette v2) : la fiche du joueur telle qu'enregistrée, rubrique par rubrique.
 * Seulement des données réelles : un champ absent s'affiche « Non renseigné ». « Modifier le profil »
 * ouvre l'écran d'édition (lot 1.19cb) ; la fiche publique reste à un clic.
 */
export function OwnProfile({
  profile,
  position,
  secondary = null,
  country,
  nationality,
  saved = false,
  editable = true,
  photoId = null,
}: {
  readonly profile: Partial<PlayerProfileOutput>;
  /** Retour de l'écran d'édition (lot 1.19cb). */
  readonly saved?: boolean;
  /** Faux pour un mineur : son tuteur modifie la fiche. */
  readonly editable?: boolean;
  /** Photo de profil saine (lot 1.19cd) ; sinon les initiales. */
  readonly photoId?: string | null;
  readonly position: string | null;
  readonly secondary?: string | null;
  readonly country: string | null;
  readonly nationality: string | null;
}) {
  const t = useTranslations('espace.profile');
  const edit = useTranslations('espace.edit');
  const feet = useTranslations('onboarding.sport.feet');
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const initials = [profile.firstName, profile.lastName]
    .map((part) => part?.charAt(0).toUpperCase() ?? '')
    .join('');
  const level = profile.verificationLevel ?? 0;
  const birth = profile.birthDate ?? (profile.birthYear ? String(profile.birthYear) : null);
  return (
    <div className="flex flex-col gap-6" data-testid="own-profile">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6">
        {photoId ? (
          <Image
            src={`/api/photos?joueur=me&id=${encodeURIComponent(photoId)}`}
            alt=""
            width={64}
            height={64}
            unoptimized
            data-testid="own-profile-photo"
            className="size-16 shrink-0 rounded-full border-2 border-oz-primary object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-oz-primary text-xl font-medium text-oz-primary"
          >
            {initials}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-medium text-oz-text">{name || t('title')}</h1>
          {profile.ozId ? (
            <p className="font-mono text-sm whitespace-nowrap text-oz-primary">{profile.ozId}</p>
          ) : null}
          <div>
            <Badge tone={level >= 1 ? 'verified' : 'neutral'} filled>
              {t(`levels.l${String(level) as '0' | '1' | '2'}`)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {editable ? (
            <Link
              href="/espace/profil/modifier"
              data-testid="own-profile-edit"
              className="inline-flex min-h-11 items-center rounded-full bg-oz-primary px-5 text-sm font-medium text-oz-on-primary hover:bg-oz-primary/90"
            >
              {edit('action')}
            </Link>
          ) : null}
          {profile.ozId ? (
            <Link
              href={`/joueur/${profile.ozId}`}
              data-testid="own-profile-public"
              className="inline-flex min-h-11 items-center rounded-full border border-oz-primary px-5 text-sm font-medium text-oz-primary hover:bg-oz-primary/10"
            >
              {t('public')}
            </Link>
          ) : null}
        </div>
      </header>
      <div aria-live="polite">
        {saved ? <Callout testId="own-profile-saved">{edit('saved')}</Callout> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Block
          title={t('identity')}
          missing={t('missing')}
          rows={[
            [t('fields.name'), name],
            [t('fields.birth'), birth],
            [t('fields.nationality'), nationality],
          ]}
        />
        <Block
          title={t('location')}
          missing={t('missing')}
          rows={[
            [t('fields.country'), country],
            [t('fields.region'), profile.region ?? null],
            [t('fields.city'), profile.city ?? null],
          ]}
        />
        <Block
          title={t('sport')}
          missing={t('missing')}
          rows={[
            [t('fields.position'), position],
            [t('fields.secondary'), secondary],
            [t('fields.foot'), profile.dominantFoot ? feet(profile.dominantFoot) : null],
          ]}
        />
        <Block
          title={t('physical')}
          missing={t('missing')}
          rows={[
            [t('fields.height'), profile.heightCm ? t('cm', { value: profile.heightCm }) : null],
            [t('fields.weight'), profile.weightKg ? t('kg', { value: profile.weightKg }) : null],
          ]}
        />
      </div>
      <p className="text-sm text-oz-text-muted">{edit('declared')}</p>
    </div>
  );
}
