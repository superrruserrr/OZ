# Contribuer à OZ

Ce guide décrit le travail réel sur le dépôt. Il applique le [plan d'exécution](docs/PLAN.md), qui
prévaut en cas de désaccord (règles R1 à R14, stratégie Git §2.3, Definition of Ready et of Done
§1.1-§1.2). Code confidentiel, soumis au NDA : les maquettes `EX CHART/` et le Document de Projet ne
sont jamais versionnés.

## Poste de travail

- macOS ou Linux, Node.js 24 LTS (`.nvmrc`), pnpm fourni par corepack (version figée dans
  `package.json`), Docker Desktop ou OrbStack (ClamAV demande environ 2 Go de mémoire, TD-004), et
  [gitleaks](https://github.com/gitleaks/gitleaks) ≥ 8.19 pour le hook pre-commit (R8).
- Installation :

  ```bash
  corepack enable
  pnpm install
  ```

- Services locaux (PostgreSQL, Redis, stockage S3, ClamAV, Mailpit), sur 127.0.0.1 uniquement :
  `pnpm dev:up`, `pnpm dev:status`, `pnpm dev:down`, `pnpm dev:reset`. Copier `.env.example` en `.env`
  (valeurs locales factices, jamais de secret réel).
- Base : `pnpm db:migrate`, `pnpm db:seed` (données synthétiques uniquement, R10), `pnpm db:rollback`.
- Applications : `pnpm dev:web` (http://localhost:3000), `pnpm --filter @oz/admin dev`
  (http://localhost:3002), API après `pnpm build` : `pnpm --filter @oz/api start` (http://localhost:3001,
  documentation `/docs`), design system : `pnpm --filter @oz/ui storybook` (http://localhost:6006).

## Travailler par lot

Le projet avance **un lot à la fois, de bas en haut** (R3, ordre du §9 du plan). Chaque lot suit les
skills du dépôt ([implementation_plan.md §1.2](implementation_plan.md)) :

1. `/plan-phase X.Y` → `phaseX.Y_plan.md` (tâches, fichiers, critères d'acceptation), validé par
   Gaëtan Wassu avant toute ligne de code.
2. `/execute-phase X.Y` → tests d'abord, puis code, puis évaluation (tests, interface, critères, revue
   adversariale pour la logique métier, la sécurité et les données) ; revue de sécurité en fin de lot.
3. `/commit-phase X.Y` → commit, branche poussée, PR vers `develop`. Chaque `git push` et chaque merge
   est confirmé par Gaëtan Wassu au moment de l'exécuter.

Une couche ne démarre pas tant que la précédente n'est pas mergée et testée (§0.2). Un écart à
l'ordre est une décision de Gaëtan Wassu, consignée dans [DEBT.md](DEBT.md).

## Branches et commits

- Branches depuis `develop` (§2.3) : `feat/p<phase>-<module>-<description>`, `fix/<ticket>-<description>`,
  `chore/<description>`, `refactor/<module>-<description>`, `test/<module>-<description>` ;
  `release/<version>` et `hotfix/<version>` seules vers `main`.
- Commits [Conventional Commits](https://www.conventionalcommits.org/fr/), vérifiés par commitlint
  (hook `commit-msg` et CI) : `feat(auth): …`, `fix(kyc): …`, `chore(deps): …`, `docs(api): …`. Le
  titre de la PR devient le message du commit squashé : il suit la même convention.
- Une branche = un module = une PR, **800 lignes modifiées au plus** hors fichiers générés (R1).
- Interdits : commit direct ou poussée forcée sur `main` et `develop`, `--no-verify`, branche de plus
  de 5 jours ouvrés sans rebase sur `develop`.

## Pull requests

- Ouvrir la PR vers `develop` dès le premier push (brouillon), avec le
  [modèle de PR](.github/pull_request_template.md) ; la passer en « prête » quand la Definition of Done
  est satisfaite.
- Les **six contrôles CI** doivent être verts : `quality`, `test`, `build-e2e`, `security`,
  `migrations`, `containers` ([docs/ci.md](docs/ci.md)). Le compte GitHub gratuit n'applique pas les
  règles de protection (DEBT D-030) : ne jamais merger une PR dont un contrôle n'est pas vert.
- Revue : développeur seul avec Claude, la revue croisée R14 passe par la revue adversariale de
  `/execute-phase` et le merge de Gaëtan Wassu, qui vaut approbation (TD-018).
- Fusion : **squash** vers `develop` (seule option activée sur le dépôt). Vers `main`, les branches
  `release/*` et `hotfix/*` passent en **merge commit** : réactiver « Allow merge commits » dans les
  réglages GitHub avant cette fusion, puis le désactiver.
- Dependabot : PR mensuelles, jamais fusionnées automatiquement ; montées majeures exclues pour les
  dépendances tranchées dans `DEBT.md` (Node, TypeScript, PostgreSQL, Redis).

## Vérifier avant de pousser

```bash
pnpm format:check
pnpm typecheck
pnpm lint            # ESLint + registre des dépendances (R12)
pnpm test            # ou pnpm test:coverage pour les seuils R6
pnpm test:stories    # si packages/ui change (Chromium : pnpm exec playwright install chromium)
pnpm build && pnpm test:e2e
```

Seuils de couverture bloquants (R6) : 70 % global, 80 % domaine et services, 100 % authentification,
KYC et facturation.

## Règles de code

- TypeScript strict ; aucun `any`, `TODO` ou `FIXME` (R5) ; aucune désactivation de règle ESLint dans
  le code : une exception passe par la configuration, justifiée et consignée dans `DEBT.md`.
- Nommage : [naming_conventions.md](naming_conventions.md), à lire avant d'écrire du code.
- Le serveur valide tout ce que le client valide (R4), avec les schémas Zod de `@oz/contracts`
  ([ADR-004](docs/adr/ADR-004-zod-contrat-unique.md)) ; toute modification de `@oz/contracts` est
  annoncée avant d'être poussée.
- Chaque endpoint a son test « rôle non autorisé » (§6.3) et sa documentation OpenAPI (R7) ; toute
  migration a son `down.sql`, testé (R9) ; toute fonctionnalité non triviale est derrière un drapeau
  (R13) ; toute action sensible est journalisée (R11).
- Aucune donnée personnelle réelle hors production (R10), aucun secret dans le dépôt (R8).

## Registres

- Nouvelle dépendance : ligne complète dans [DEPENDENCIES.md](DEPENDENCIES.md) (licence, poids,
  alternative native envisagée) avant le merge (R12) ; `pnpm lint` le vérifie. Aucun script
  d'installation, aucune exception de chaîne d'approvisionnement sans accord explicite.
- Dette acceptée : [DEBT.md](DEBT.md), avec échéance et responsable (R5).
- Décision structurante : un ADR dans [docs/adr](docs/adr/README.md).
- Chaque lot ajoute son entrée à [CHANGELOG.md](CHANGELOG.md).

## Sécurité

Une vulnérabilité ne se signale jamais dans une issue ou une PR publique : voir
[SECURITY.md](SECURITY.md).
