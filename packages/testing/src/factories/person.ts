import { seededFaker, slug } from './random.js';

/**
 * Personnes synthétiques (R10, EX-T10.1). Trois marqueurs les rendent impossibles à confondre avec
 * des personnes réelles (décision D4 du lot 0.6) : email en `@example.test` (RFC 2606), téléphone
 * sous l'indicatif `+999` (non attribué par l'UIT), numéro de document préfixé `SYN-`.
 */
export interface SyntheticPerson {
  readonly firstName: string;
  readonly lastName: string;
  /** Date de naissance `AAAA-MM-JJ`. */
  readonly birthDate: string;
  readonly email: string;
  readonly phone: string;
  readonly documentNumber: string;
  /** Code pays ISO 3166-1 alpha-2. */
  readonly country: string;
}

/** Date de référence des âges : fixe, pour que les données ne changent pas avec le calendrier. */
export const REFERENCE_DATE = '2026-01-01';

/** Pays des données synthétiques (ISO 3166-1 alpha-2). */
export const SYNTHETIC_COUNTRIES = ['CM', 'CI', 'SN', 'NG', 'GH', 'FR'] as const;

const MIN_AGE = 10;
const MAX_AGE = 40;
const DAY_MS = 86_400_000;

/** Date de naissance donnant exactement `age` ans à la date de référence. */
function birthDateFor(age: number, dayOffset: number): string {
  const reference = new Date(`${REFERENCE_DATE}T00:00:00Z`);
  const latest = Date.UTC(
    reference.getUTCFullYear() - age,
    reference.getUTCMonth(),
    reference.getUTCDate(),
  );
  const earliest =
    Date.UTC(
      reference.getUTCFullYear() - age - 1,
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ) + DAY_MS;
  const span = Math.round((latest - earliest) / DAY_MS);
  return new Date(latest - (dayOffset % (span + 1)) * DAY_MS).toISOString().slice(0, 10);
}

/** Personnes par série : le téléphone `+999` + graine (3 chiffres) + rang (6 chiffres) reste unique. */
export const MAX_SERIES = 999_999;

export function createPersonFactory(
  seed: number,
  options: { start?: number } = {},
): {
  person(options?: { age?: number }): SyntheticPerson;
  persons(count: number): SyntheticPerson[];
} {
  const faker = seededFaker(seed);
  let sequence = options.start ?? 0;

  const person = (personOptions: { age?: number } = {}): SyntheticPerson => {
    sequence += 1;
    if (sequence > MAX_SERIES) {
      throw new Error(
        `Série synthétique au-delà de sa capacité (${String(MAX_SERIES)} personnes).`,
      );
    }
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const age = personOptions.age ?? faker.number.int({ min: MIN_AGE, max: MAX_AGE });
    return {
      firstName,
      lastName,
      birthDate: birthDateFor(age, faker.number.int({ min: 0, max: 365 })),
      email: `${slug(firstName)}.${slug(lastName)}.${String(seed)}.${String(sequence)}@example.test`,
      // Unique dans la série (colonnes à contrainte d'unicité) : graine sur 3 chiffres, rang sur 6.
      phone: `+999${String(seed % 1000).padStart(3, '0')}${String(sequence).padStart(6, '0')}`,
      documentNumber: `SYN-${faker.string.alphanumeric({ length: 9, casing: 'upper' })}`,
      country: faker.helpers.arrayElement(SYNTHETIC_COUNTRIES),
    };
  };

  return {
    person,
    persons: (count) => Array.from({ length: count }, () => person()),
  };
}

/** Vrai seulement si les trois marqueurs synthétiques sont présents. */
export function isSyntheticPerson(
  person: Pick<SyntheticPerson, 'email' | 'phone' | 'documentNumber'>,
): boolean {
  return (
    person.email.endsWith('@example.test') &&
    /^\+999\d{9}$/.test(person.phone) &&
    person.documentNumber.startsWith('SYN-')
  );
}
