'use client';

import {
  playerProfileUpdateInputSchema,
  signupSportSchema,
  type PlayerProfileOutput,
} from '@oz/contracts';
import { Button, Callout, Field, Select } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { useRouter } from '../i18n/navigation';
import type { CountryOption } from '../onboarding/countries';
import { messageKey, signupFieldMessageKey } from '../onboarding/field-message';
import { updateOwnProfile, type EspaceFailure } from './actions';
import { call, EspaceError } from './espace-ui';

/** Radix Select n'accepte pas de valeur vide : « aucun poste secondaire ». */
const NONE = 'none';
const FEET = ['right', 'left', 'both'] as const;
const NUMBERS = ['heightCm', 'weightKg'] as const;
const NULLABLE = new Set(['region', 'city', 'secondaryPosition', 'heightCm', 'weightKg']);

type FieldName =
  | 'firstName'
  | 'lastName'
  | 'region'
  | 'city'
  | (typeof NUMBERS)[number]
  | 'nationality'
  | 'primaryPosition'
  | 'secondaryPosition'
  | 'dominantFoot';
type Draft = Record<FieldName, string>;

const FIELDS: readonly FieldName[] = [
  'firstName',
  'lastName',
  'nationality',
  'region',
  'city',
  'primaryPosition',
  'secondaryPosition',
  'dominantFoot',
  'heightCm',
  'weightKg',
];

export function draftOf(profile: Partial<PlayerProfileOutput>): Draft {
  const text = (value: string | number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);
  return {
    firstName: text(profile.firstName),
    lastName: text(profile.lastName),
    nationality: text(profile.nationality),
    region: text(profile.region),
    city: text(profile.city),
    primaryPosition: text(profile.primaryPosition),
    secondaryPosition: text(profile.secondaryPosition) || NONE,
    dominantFoot: text(profile.dominantFoot),
    heightCm: text(profile.heightCm),
    weightKg: text(profile.weightKg),
  };
}

/** Valeur envoyée à l'API : vide → `null` (champ facultatif), nombre saisi → entier, « aucun » → `null`. */
function valueOf(field: FieldName, raw: string): string | number | null | undefined {
  const value = raw.trim();
  if (field === 'secondaryPosition') return value === NONE || value === '' ? null : value;
  if (value === '') return NULLABLE.has(field) ? null : undefined;
  if ((NUMBERS as readonly string[]).includes(field)) return Number(value);
  return value;
}

/** Seuls les champs changés partent ; les champs d'identité figés jamais. */
export function patchOf(
  initial: Draft,
  draft: Draft,
  locked: boolean,
): Partial<Record<FieldName, string | number | null>> {
  const patch: Partial<Record<FieldName, string | number | null>> = {};
  for (const field of FIELDS) {
    if (locked && (field === 'firstName' || field === 'lastName' || field === 'nationality')) {
      continue;
    }
    const before = valueOf(field, initial[field]);
    const after = valueOf(field, draft[field]);
    if (after !== undefined && after !== before) patch[field] = after;
  }
  return patch;
}

/**
 * Modifier mon profil (lot 1.19cb) : les champs de la fiche, préremplis, envoyés seulement s'ils
 * changent. Prénom, nom et nationalité sont en lecture seule dès que l'identité est examinée ou
 * vérifiée (U3) ; le pays de rattachement, inscrit dans l'OZ ID, ne se modifie pas.
 */
export function ProfileForm({
  profile,
  countries,
}: {
  readonly profile: Partial<PlayerProfileOutput>;
  readonly countries: readonly CountryOption[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const locked = (profile.verificationStatus ?? 'declared') !== 'declared';
  const [initial] = useState(() => draftOf(profile));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [failure, setFailure] = useState<EspaceFailure | null>(null);
  const [pending, setPending] = useState(false);
  const patch = patchOf(initial, draft, locked);
  const changed = Object.keys(patch).length > 0;

  const set = (field: FieldName) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const error = (field: FieldName) => {
    const key = errors[field];
    return key ? t(key) : null;
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!changed) return;
    const parsed = playerProfileUpdateInputSchema.safeParse(patch);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName | undefined;
        if (field && !next[field]) {
          next[field] = signupFieldMessageKey(issue.message) ?? 'onboarding.errors.required';
        }
      }
      setErrors(next);
      return;
    }
    setPending(true);
    void call(() => updateOwnProfile(parsed.data)).then((result) => {
      if (result.ok) {
        router.push({ pathname: '/espace/profil', query: { modifie: '1' } });
        return;
      }
      setPending(false);
      setFailure(result);
    });
  };

  const positions = signupSportSchema.shape.primaryPosition.options.map((value) => ({
    value,
    label: t(`onboarding.positions.${messageKey(value)}`),
  }));
  const optional = t('onboarding.optional');
  const section =
    'flex flex-col gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-5 sm:p-6';
  const heading = 'text-lg font-medium text-oz-text';

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-6"
      data-testid="espace-profile-form"
    >
      <EspaceError failure={failure} testId="espace-profile-error" />
      <fieldset className={section}>
        <legend className={`${heading} float-left mb-2 w-full`}>
          {t('espace.profile.identity')}
        </legend>
        {locked ? (
          <p className="text-sm text-oz-text-muted" data-testid="espace-profile-locked">
            {t('espace.edit.locked')}
          </p>
        ) : null}
        {(['firstName', 'lastName'] as const).map((field) => (
          <Field
            key={field}
            id={`espace-${field}`}
            data-testid={`espace-${field}`}
            label={t(`onboarding.identity.${field}`)}
            autoComplete={field === 'firstName' ? 'given-name' : 'family-name'}
            readOnly={locked}
            value={draft[field]}
            onChange={(event) => {
              set(field)(event.currentTarget.value);
            }}
            error={error(field)}
          />
        ))}
        <Select
          id="espace-nationality"
          data-testid="espace-nationality"
          label={t('onboarding.identity.nationality')}
          placeholder={t('onboarding.choose')}
          options={countries}
          disabled={locked}
          {...(draft.nationality ? { value: draft.nationality } : {})}
          onValueChange={set('nationality')}
          error={error('nationality')}
        />
      </fieldset>

      <fieldset className={section}>
        <legend className={`${heading} float-left mb-2 w-full`}>
          {t('espace.profile.location')}
        </legend>
        <p className="text-sm text-oz-text-muted">{t('espace.edit.country')}</p>
        {(['region', 'city'] as const).map((field) => (
          <Field
            key={field}
            id={`espace-${field}`}
            data-testid={`espace-${field}`}
            label={t(`onboarding.identity.${field}`)}
            meta={optional}
            autoComplete={field === 'region' ? 'address-level1' : 'address-level2'}
            value={draft[field]}
            onChange={(event) => {
              set(field)(event.currentTarget.value);
            }}
            error={error(field)}
          />
        ))}
      </fieldset>

      <fieldset className={section}>
        <legend className={`${heading} float-left mb-2 w-full`}>{t('espace.profile.sport')}</legend>
        <Select
          id="espace-primaryPosition"
          data-testid="espace-primaryPosition"
          label={t('espace.profile.fields.position')}
          placeholder={t('onboarding.choose')}
          options={positions}
          {...(draft.primaryPosition ? { value: draft.primaryPosition } : {})}
          onValueChange={set('primaryPosition')}
          error={error('primaryPosition')}
        />
        <Select
          id="espace-secondaryPosition"
          data-testid="espace-secondaryPosition"
          label={t('espace.profile.fields.secondary')}
          options={[{ value: NONE, label: t('espace.edit.noPosition') }, ...positions]}
          value={draft.secondaryPosition}
          onValueChange={set('secondaryPosition')}
          error={error('secondaryPosition')}
        />
        <Select
          id="espace-dominantFoot"
          data-testid="espace-dominantFoot"
          label={t('espace.profile.fields.foot')}
          placeholder={t('onboarding.choose')}
          options={FEET.map((value) => ({ value, label: t(`onboarding.sport.feet.${value}`) }))}
          {...(draft.dominantFoot ? { value: draft.dominantFoot } : {})}
          onValueChange={set('dominantFoot')}
          error={error('dominantFoot')}
        />
      </fieldset>

      <fieldset className={section}>
        <legend className={`${heading} float-left mb-2 w-full`}>
          {t('espace.profile.physical')}
        </legend>
        {NUMBERS.map((field) => (
          <Field
            key={field}
            id={`espace-${field}`}
            data-testid={`espace-${field}`}
            label={t(`espace.profile.fields.${field === 'heightCm' ? 'height' : 'weight'}`)}
            meta={t(field === 'heightCm' ? 'espace.edit.cmHint' : 'espace.edit.kgHint')}
            type="number"
            inputMode="numeric"
            value={draft[field]}
            onChange={(event) => {
              set(field)(event.currentTarget.value);
            }}
            error={error(field)}
          />
        ))}
        <Callout>{t('espace.edit.declared')}</Callout>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          loading={pending}
          disabled={pending || !changed}
          data-testid="espace-profile-submit"
        >
          {t('espace.edit.save')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            router.push('/espace/profil');
          }}
        >
          {t('espace.edit.cancel')}
        </Button>
      </div>
    </form>
  );
}
