import { SYNTHETIC_COUNTRIES } from './person.js';
import { seededFaker } from './random.js';

/** Six types d'organisation (requirements.md D-K04), valeurs en snake_case (naming_conventions.md). */
export const ORGANIZATION_TYPES = [
  'academy',
  'club',
  'federation',
  'center',
  'recruiter',
  'agency',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export interface SyntheticOrganization {
  readonly type: OrganizationType;
  readonly name: string;
  readonly contactEmail: string;
  /** Numéro d'immatriculation fictif, préfixé `SYN-`. */
  readonly registrationNumber: string;
  readonly country: string;
}

export function createOrganizationFactory(seed: number): {
  organization(options?: { type?: OrganizationType }): SyntheticOrganization;
  organizations(count: number): SyntheticOrganization[];
} {
  const faker = seededFaker(seed);
  let sequence = 0;

  const organization = (options: { type?: OrganizationType } = {}): SyntheticOrganization => {
    // Types parcourus en rotation : chaque lot de six contient tous les types.
    const type = options.type ?? ORGANIZATION_TYPES[sequence % ORGANIZATION_TYPES.length] ?? 'club';
    sequence += 1;
    return {
      type,
      name: `${faker.location.city()} ${faker.word.noun()}`,
      contactEmail: `${type}.${String(seed)}.${String(sequence)}@example.test`,
      registrationNumber: `SYN-${faker.string.alphanumeric({ length: 10, casing: 'upper' })}`,
      country: faker.helpers.arrayElement(SYNTHETIC_COUNTRIES),
    };
  };

  return {
    organization,
    organizations: (count) => Array.from({ length: count }, () => organization()),
  };
}
