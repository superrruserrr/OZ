# OZ — Football ID

Plateforme d'identité numérique vérifiée du footballeur. Code confidentiel, soumis au NDA.

## Démarrer

```bash
corepack enable          # fournit pnpm (version figée dans package.json)
pnpm install
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

Le hook pre-commit exige [gitleaks](https://github.com/gitleaks/gitleaks) installé sur le poste (règle R8).

## Documents de référence

| Document | Rôle |
|---|---|
| `OZ_Plan_Execution_Technique.md` | Référence d'exécution : règles R1-R14, lots, Git |
| `requirements.md` · `design.md` | Exigences (EX-xxx) et conception, issues de `/kickoff` |
| `technology_decisions.md` | Décisions TD-001 à TD-017 |
| `implementation_plan.md` | Une phase d'implémentation par lot |
| `naming_conventions.md` | Conventions de nommage, à lire avant d'écrire du code |
| `DEPENDENCIES.md` · `DEBT.md` · `CHANGELOG.md` | Registres obligatoires (R12, R5) |

## Arborescence

```
apps/       web · admin · api · worker
packages/   contracts · db · ui · core · auth · config · testing
infra/      docker · terraform · scripts
docs/       adr · runbooks · api · security
```
