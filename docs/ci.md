# Intégration continue

Lot 0.7 — EX-007, EX-T03, EX-T06. Workflow : [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), déclenché sur chaque PR et chaque poussée vers `develop` et `main`. Une PR ne se merge que si les cinq jobs sont verts (règles [`.github/rulesets/`](../.github/rulesets/)).

## Jobs exigés

| Job          | Contrôles                                                                                                                                                                                                                                                                                          | Reproduire sur le poste                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `quality`    | Format, ESLint + registre R12, typecheck, commitlint des commits de la PR ; vers `main`, branche source `release/*` ou `hotfix/*` seulement                                                                                                                                                        | `pnpm format:check && pnpm lint && pnpm typecheck`                    |
| `test`       | Tests unitaires et d'intégration (Testcontainers), couverture : 70 % global, 80 % domaine et services, 100 % authentification, KYC, facturation (R6)                                                                                                                                               | `pnpm test:coverage`                                                  |
| `build-e2e`  | Build de toutes les apps, fumée Playwright + axe sur les serveurs autonomes                                                                                                                                                                                                                        | `pnpm build && pnpm test:e2e`                                         |
| `security`   | gitleaks sur l'historique de la branche, `pnpm audit` (≥ high), Trivy (vulnérabilités du lockfile et secrets ≥ HIGH ; l'analyse de configuration n'a pas encore de cible : Dockerfile et Terraform arriveront au lot 0.8), Semgrep (≥ WARNING ; le jeu `p/nextjs` ne contient encore aucune règle) | voir `scripts/install-ci-tools.sh` et la commande Semgrep du workflow |
| `migrations` | PostgreSQL 16.15 : toutes les migrations en `up`, chacune en `down`, puis `up` (sortie vérifiée)                                                                                                                                                                                                   | `scripts/ci-migrations.sh` (avec `DATABASE_URL`, `APP_ENV=local`)     |

## Note : gitleaks sur le poste

La CI analyse l'historique Git (`gitleaks git`). Sur le poste, `gitleaks dir .` signale aussi les builds `.next/` (fichiers minifiés, ignorés par Git) : utiliser `gitleaks git --log-opts="--all" .`, ou le hook pre-commit qui analyse les fichiers indexés.

## Chaîne d'approvisionnement

- Actions épinglées par empreinte de commit (version en commentaire) ; Dependabot les met à jour, sans auto-merge, 14 jours après publication.
- gitleaks et Trivy : binaires officiels, versions et SHA-256 figés dans `scripts/install-ci-tools.sh` ; Semgrep : image épinglée par condensé. Versions retenues publiées depuis plus de deux semaines.
- pnpm : lockfile figé, `trustPolicy: no-downgrade` (refuse un paquet ayant perdu son attestation de provenance), `blockExoticSubdeps`, scripts d'installation refusés sauf `@prisma/engines`.
- Permissions du jeton : lecture seule ; pas de `pull_request_target` ; identifiants Git non conservés après `checkout`.

## Protection des branches

Les fichiers `.github/rulesets/develop.json` et `main.json` s'importent dans GitHub : _Settings → Rules → Rulesets → New ruleset → Import a ruleset_. Ils exigent une PR, les cinq contrôles à jour avec la base et la résolution des discussions, et interdisent suppression et poussée forcée. `develop` : squash seul, historique linéaire. `main` : merge commit des branches `release/*` et `hotfix/*`. Aucune approbation n'est exigée (TD-018) : développeur seul, GitHub refuse l'auto-approbation ; la revue passe par la revue adversariale et le merge de Gaëtan Wassu (R14 adapté). Sur un dépôt privé, l'application des règles demande GitHub Pro. **Aujourd'hui (compte gratuit, DEBT D-030), elles ne sont pas appliquées : ne merger qu'une PR dont les cinq contrôles sont verts.**
