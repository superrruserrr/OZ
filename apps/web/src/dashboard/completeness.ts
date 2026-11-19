import type { PlayerProfileOutput } from '@oz/contracts';

/** Rubriques de l'hexagone de complétude, dans l'ordre des sommets (premier en haut). */
export const RUBRICS = [
  'identity',
  'location',
  'sport',
  'physical',
  'verification',
  'contact',
] as const;
export type Rubric = (typeof RUBRICS)[number];

export interface RubricCompleteness {
  key: Rubric;
  filled: number;
  total: number;
  /** Part des champs renseignés, arrondie à l'entier (0 à 100). */
  percent: number;
}

export interface ProfileCompleteness {
  rubrics: readonly RubricCompleteness[];
  filled: number;
  total: number;
}

const present = (value: unknown) => value !== undefined && value !== null && value !== '';

/*
 * Complétude réelle de la fiche (lot 1.5ec, E4) : pour chaque rubrique, la part des champs que le
 * joueur a renseignés ; la vérification compte ses deux niveaux atteints. Rien n'est estimé : un champ
 * absent compte zéro. Ce n'est ni une note ni une aptitude, seulement l'état de la fiche.
 */
export function profileCompleteness(profile: Partial<PlayerProfileOutput>): ProfileCompleteness {
  const fields: Record<Rubric, readonly boolean[]> = {
    identity: [
      present(profile.firstName),
      present(profile.lastName),
      present(profile.birthDate) || present(profile.birthYear),
      present(profile.nationality),
    ],
    location: [present(profile.country), present(profile.region), present(profile.city)],
    sport: [
      present(profile.primaryPosition),
      present(profile.secondaryPosition),
      present(profile.dominantFoot),
    ],
    physical: [present(profile.heightCm), present(profile.weightKg)],
    verification: [(profile.verificationLevel ?? 0) >= 1, (profile.verificationLevel ?? 0) >= 2],
    contact: [present(profile.phone)],
  };
  const rubrics = RUBRICS.map((key) => {
    const total = fields[key].length;
    const filled = fields[key].filter(Boolean).length;
    return { key, filled, total, percent: Math.round((filled / total) * 100) };
  });
  return {
    rubrics,
    filled: rubrics.reduce((sum, rubric) => sum + rubric.filled, 0),
    total: rubrics.reduce((sum, rubric) => sum + rubric.total, 0),
  };
}
