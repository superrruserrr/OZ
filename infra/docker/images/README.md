# Images des applications

Lot 0.8a. Une image par application déployée : `api.Dockerfile` (NestJS), `next.Dockerfile` (`APP=web` ou `APP=admin`). Le worker aura la sienne avec son premier code (DEBT D-031).

## Règles

- **Construction** : `turbo prune <app> --docker` isole le sous-ensemble du monorepo et du lockfile, installation figée, build Turbo. API : `pnpm deploy --prod` (dépendances de production seules). Web et admin : sortie Next `standalone`.
- **Exécution** : `gcr.io/distroless/nodejs24-debian13:nonroot` — ni shell ni gestionnaire de paquets, utilisateur `65532`. Le code appartient à root (lecture seule pour l'utilisateur) ; seul `.next/cache` lui appartient.
- **pnpm** épinglé par empreinte SHA-512 dans `packageManager` (vérifiée par corepack au build).
- **Bases épinglées par condensé**, version en commentaire ; Dependabot (écosystème `docker`) les met à jour 14 jours après publication.
- **Aucun secret au build** : la configuration arrive par l'environnement à l'exécution ; `.dockerignore` exclut `.env`, `.git` et les documents confidentiels.
- **Analyse** : `trivy image --config trivy-image.yaml` (sans les exclusions de `trivy.yaml` : les `node_modules` livrés sont analysés).
- **Santé** : `healthcheck.mjs` (sonde HTTP en Node) — API : `/health/live` (vivacité, sans dépendance ; `/health` reste la disponibilité) ; web et admin : `/robots.txt`.
- **Démarrage** : web et admin passent par `next-start.mjs`, qui impose l'écoute sur `0.0.0.0` quel que soit `HOSTNAME` (D-013). Un `APP_ENV` absent ou invalide arrête le conteneur (D-021).

## Commandes

```bash
docker build -f infra/docker/images/api.Dockerfile -t oz-api .
docker build -f infra/docker/images/next.Dockerfile --build-arg APP=web -t oz-web .
pnpm test:containers   # compose de fumée + Playwright sur les conteneurs
```

Vérifié par `scripts/docker-images.test.mjs` (bases, utilisateur, santé, absence de secret) et par le job CI `containers` (Trivy ≥ HIGH bloquant, fumée).
