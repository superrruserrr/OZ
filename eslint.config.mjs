import { builtinModules } from 'node:module';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Attributs lus par l'utilisateur ou les technologies d'assistance : leur texte passe par l'i18n.
const READABLE_ATTRIBUTE =
  'JSXAttribute[name.name=/^(alt|title|placeholder|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/]';

// Texte en dur (chaîne non vide ou gabarit) et expressions qui le transportent tel quel.
const HARD_TEXT = ':matches(Literal[value=/\\S/], TemplateLiteral)';
const TEXT_WRAPPER =
  ":matches(ConditionalExpression, LogicalExpression, BinaryExpression[operator='+'], ArrayExpression)";
const BUTTON_VALUE =
  "JSXOpeningElement:has(JSXAttribute[name.name='type'] > Literal[value=/^(submit|button|reset)$/]) > JSXAttribute[name.name='value']";

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/src/generated/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      '.claude/**',
    ],
  },
  {
    // R5 : aucune désactivation de règle dans le code. Une exception passe par la configuration,
    // justifiée en revue et consignée dans DEBT.md.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.ts', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // R5 : aucun `any` ; toute dette passe par DEBT.md, pas par un commentaire
      '@typescript-eslint/no-explicit-any': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'anywhere' }],
      // EX-T19 : les logs passent par le logger structuré, jamais par la console
      'no-console': 'error',
      // Modules NestJS : classes décorées sans membre d'instance
      // Paramètre imposé par une signature mais inutilisé : préfixe « _ » explicite.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // packages/contracts s'exécute dans le navigateur ET le serveur (EX-005) : ni Node, ni framework.
    files: ['packages/contracts/**/*.ts'],
    ignores: ['packages/contracts/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'Module Node interdit dans @oz/contracts.',
          })),
          patterns: [
            {
              group: ['npm:*', 'jsr:*', 'http:*', 'https:*'],
              message: 'Import par URL ou par registre interdit dans @oz/contracts.',
            },
            {
              // @oz/config dépend de l'environnement serveur ; les contrats ne dépendent d'aucun paquet OZ.
              group: ['@oz/*'],
              message: '@oz/contracts ne dépend d’aucun autre paquet OZ.',
            },
            {
              group: ['node:*', 'bun:*'],
              message: 'Module d’environnement interdit dans @oz/contracts.',
            },
            {
              // Seul « zod » (v4 classique) : zod/mini et zod/v3 échappent au contrôle de rigueur.
              group: ['zod/*'],
              message: 'Importer « zod » uniquement (contrôle de rigueur des schémas).',
            },
            {
              group: [
                '@nestjs/*',
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'next',
                'next/*',
              ],
              message: 'Framework interdit dans @oz/contracts.',
            },
          ],
        },
      ],
      // Globales serveur : interdites aussi via alias, déstructuration ou globalThis.
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'process interdit dans @oz/contracts.' },
        { name: 'require', message: 'require interdit dans @oz/contracts.' },
        { name: 'globalThis', message: 'globalThis interdit dans @oz/contracts.' },
      ],
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // Une déclaration locale (declare const process…) masquerait la globale à no-restricted-globals.
          selector:
            'VariableDeclarator[id.name=/^(process|require|globalThis)$/], :matches(FunctionDeclaration, TSDeclareFunction)[id.name=/^(process|require)$/]',
          message: 'Déclarer process, require ou globalThis est interdit dans @oz/contracts.',
        },
        {
          selector: 'ImportExpression',
          message: 'import() dynamique interdit dans @oz/contracts.',
        },
        {
          selector: "CallExpression[callee.name='require']",
          message: 'require() interdit dans @oz/contracts.',
        },
        {
          selector: "MemberExpression[object.name='process']",
          message: 'process interdit dans @oz/contracts (code exécuté aussi dans le navigateur).',
        },
      ],
    },
  },
  {
    // Applications Next.js : règles du framework et Core Web Vitals (EX-T22, connexion faible).
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    settings: { next: { rootDir: ['apps/web/', 'apps/admin/'] } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // EX-T21.3 : toute chaîne d'interface passe par l'i18n (next-intl), jamais en dur ;
    // pas d'attribut style (CSP §6.5). Formes couvertes et limites connues : scripts/eslint-i18n.test.mjs
    // et DEBT.md (D-020) ; la revue de code reste le dernier filet.
    files: ['apps/web/src/**/*.tsx', 'apps/admin/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\S/]',
          message: 'Texte en dur : passer par une clé i18n (useTranslations / getTranslations).',
        },
        {
          selector:
            ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(Literal[value=/\\S/], TemplateLiteral)',
          message: 'Texte en dur entre accolades : passer par une clé i18n.',
        },
        {
          // Condition, &&, ||, concaténation ou tableau : le texte reste en dur (revue lot 0.4).
          selector: `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > ${TEXT_WRAPPER} > ${HARD_TEXT}`,
          message: 'Texte en dur dans une expression : passer par une clé i18n.',
        },
        {
          selector: [
            `${READABLE_ATTRIBUTE} > Literal[value=/\\S/]`,
            `${READABLE_ATTRIBUTE} > JSXExpressionContainer > ${HARD_TEXT}`,
            `${READABLE_ATTRIBUTE} > JSXExpressionContainer > ${TEXT_WRAPPER} > ${HARD_TEXT}`,
            // Libellé d'un bouton de formulaire : `value` est lu à l'écran.
            `${BUTTON_VALUE} > Literal[value=/\\S/]`,
            `${BUTTON_VALUE} > JSXExpressionContainer > ${HARD_TEXT}`,
          ].join(', '),
          message: 'Attribut lisible en dur : passer par une clé i18n.',
        },
        {
          selector:
            'Property[key.name=/^(title|description|template|default|absolute)$/] > :matches(Literal[value=/\\S/], TemplateLiteral)',
          message: 'Métadonnée en dur (title, description…) : passer par getTranslations.',
        },
        {
          // La CSP (style-src sans 'unsafe-inline') bloquerait l'attribut style rendu côté serveur.
          selector:
            "JSXAttribute[name.name='style'], JSXSpreadAttribute Property[key.name='style']",
          message: 'Attribut style interdit (CSP) : utiliser des classes Tailwind.',
        },
        {
          selector:
            "CallExpression:matches([callee.name='createElement'], [callee.property.name='createElement'])",
          message: 'createElement échappe aux contrôles i18n et CSP : écrire du JSX.',
        },
      ],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
