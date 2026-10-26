import { builtinModules } from 'node:module';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**', '.claude/**'],
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
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
