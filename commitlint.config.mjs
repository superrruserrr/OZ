// Conventional Commits (§2.3 du plan). Scopes : modules métier (§3.4), apps, paquets, transverses.
const scopes = [
  // modules métier
  'identity',
  'player',
  'organization',
  'kyc',
  'document',
  'import',
  'search',
  'notification',
  'audit',
  'performance',
  'roster',
  'history',
  'analytics',
  'billing',
  'intelligence',
  'media',
  'messaging',
  'marketplace',
  // apps et paquets
  'web',
  'admin',
  'api',
  'worker',
  'contracts',
  'db',
  'ui',
  'core',
  'auth',
  'config',
  'testing',
  // transverses
  'repo',
  'deps',
  'ci',
  'infra',
  'docs',
  'security',
  'release',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', scopes],
    'subject-case': [0],
  },
};
