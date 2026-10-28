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

// Titre d'une montée Dependabot : chemin du répertoire et nom du groupe le rallongent au-delà de
// 100 caractères (images Docker). Seule cette forme exacte a droit à 200 ; tout autre titre reste
// à 100, comme dans @commitlint/config-conventional.
const HEADER_MAX = 100;
const DEPENDABOT_HEADER_MAX = 200;
const DEPENDABOT_HEADER =
  /^chore\(deps\): bump \S+ from \S+ to \S+(?: in \/\S*)?(?: in the [\w-]+ group)?$/i;

const headerLength = (parsed) => {
  const header = parsed.header ?? '';
  const max = DEPENDABOT_HEADER.test(header) ? DEPENDABOT_HEADER_MAX : HEADER_MAX;
  return [
    header.length <= max,
    `header must not be longer than ${String(max)} characters, current length is ${String(header.length)}`,
  ];
};

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'oz/header-max-length': headerLength } }],
  rules: {
    'scope-enum': [2, 'always', scopes],
    'subject-case': [0],
    'header-max-length': [0],
    'oz/header-max-length': [2, 'always'],
  },
};
