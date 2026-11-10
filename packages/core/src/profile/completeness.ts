// Score de complétude du profil (lot 1.7a, proposition P4, EX-121) : part pondérée des éléments
// renseignés, de 0 à 100. Indicatif pour le joueur seulement : jamais une note, jamais un critère de
// recherche ni de classement (Q18).

export interface CompletenessInput {
  readonly firstName?: string | null | undefined;
  readonly lastName?: string | null | undefined;
  readonly birthDate?: string | null | undefined;
  readonly country?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly primaryPosition?: string | null | undefined;
  readonly secondaryPosition?: string | null | undefined;
  readonly dominantFoot?: string | null | undefined;
  readonly heightCm?: number | null | undefined;
  readonly weightKg?: number | null | undefined;
  readonly phoneVerified?: boolean | undefined;
  readonly photo?: boolean | undefined;
  readonly organization?: boolean | undefined;
  readonly identityVerified?: boolean | undefined;
}

/** Poids des éléments : identité 30, sport 30, contact et rattachement 20, photo et vérification 20. */
export const COMPLETENESS_WEIGHTS = {
  firstName: 5,
  lastName: 5,
  birthDate: 10,
  country: 5,
  city: 5,
  primaryPosition: 10,
  secondaryPosition: 5,
  dominantFoot: 5,
  heightCm: 5,
  weightKg: 5,
  phoneVerified: 10,
  organization: 10,
  photo: 10,
  identityVerified: 10,
} as const satisfies Record<keyof CompletenessInput, number>;

const filled = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : value !== null && value !== undefined && value !== '';

export function profileCompleteness(input: CompletenessInput): number {
  let score = 0;
  for (const [key, weight] of Object.entries(COMPLETENESS_WEIGHTS)) {
    if (filled(input[key as keyof CompletenessInput])) score += weight;
  }
  return Math.min(100, score);
}
