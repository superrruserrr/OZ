/** Fixtures, factories et helpers de test (lot 0.6) */
export const PACKAGE_NAME = '@oz/testing' as const;

export {
  createPersonFactory,
  isSyntheticPerson,
  MAX_SERIES,
  REFERENCE_DATE,
  SYNTHETIC_COUNTRIES,
  type SyntheticPerson,
} from './factories/person.js';
export {
  createOrganizationFactory,
  ORGANIZATION_TYPES,
  type OrganizationType,
  type SyntheticOrganization,
} from './factories/organization.js';
