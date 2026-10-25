# Dette technique acceptée (R5)

Toute dette acceptée est consignée ici avec une échéance ferme et un responsable nommé. Revue bimensuelle (§13.1 du plan).

| # | Dette | Pourquoi acceptée | Échéance | Responsable | Statut |
|---|---|---|---|---|---|
| D-001 | Poste de développement en Node.js 22 ; cible Node 24 LTS (TD-001, `.nvmrc`) | Node 22 satisfait `engines` (≥ 22.12) et toutes les dépendances du lot 0.1 | Avant le lot 0.7 (la CI tournera en Node 24) | Gaëtan Wassu | Ouverte |
| D-002 | TypeScript 6.0 au lieu de 7.0 | typescript-eslint 8.72 n'accepte que TypeScript < 6.1 | Revue trimestrielle : monter dès que typescript-eslint supporte TypeScript 7 | Claude (Dev A) | Ouverte |
| D-003 | Règles gitleaks `oz-jwt-secret-*` à vérifier avec le vrai binaire | gitleaks n'était pas installé | 2026-10-25 | Gaëtan Wassu, Claude | **Fermée le 2026-10-25** : gitleaks 8.30.1 (empreinte SHA-256 vérifiée) — 23/23 fixtures conformes (10 secrets détectés, 13 cas légitimes sans alerte), aucune fuite sur les fichiers du dépôt, hook pre-commit testé de bout en bout (secret, message, `any` refusés ; commit propre accepté) |
| D-004 | Les hooks locaux se contournent (`git commit --no-verify`, `HUSKY=0`) : R8 repose sur le poste jusqu'au gitleaks en CI | Pas de CI avant le lot 0.7 ; la protection de branche exigera la CI verte | Lot 0.7 (job gitleaks bloquant) | Claude (Dev A) | Ouverte |
| D-005 | PostgreSQL local en version 16 (`infra/docker/compose.dev.yml`) sans confirmation de la version majeure proposée par Scaleway Managed PostgreSQL | L'API Scaleway exige un compte pour lister les versions ; la documentation publique est obsolète. 16 = version du plan | Lot 0.8 (création des bases managées) : aligner l'image locale sur la version retenue | Gaëtan Wassu | Ouverte |
