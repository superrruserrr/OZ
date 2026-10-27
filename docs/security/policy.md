# Politique de sécurité

Référence : [plan d'exécution](../PLAN.md) §3.5 et §6.2 à §6.9 ; risques détaillés dans le
[modèle de menaces](threats.md) ; signalement dans [SECURITY.md](../../SECURITY.md).

Chaque mesure porte son état réel au 2026-10-27 :

- **En place** : la mesure existe dans le code ou l'infrastructure, avec sa preuve (test, job CI,
  fichier) ;
- **Prévue** : la mesure est livrée par le lot indiqué ;
- **Partielle** : la mesure existe avec un écart ouvert dans [DEBT.md](../../DEBT.md).

## Principes

1. **Le serveur décide.** Le client valide pour guider, le serveur valide tout, toujours, avec les
   mêmes schémas Zod ([ADR-004](../adr/ADR-004-zod-contrat-unique.md), R4).
2. **On ne masque jamais une donnée côté client : on ne l'envoie pas** (§3.5).
3. **Refus par défaut** : un accès non explicitement autorisé est refusé.
4. **Minimisation** : on ne collecte que ce que la finalité déclarée exige (§6.7 n° 7).
5. **Aucune donnée personnelle réelle hors production** (R10), **aucun secret dans le dépôt** (R8).

## Cloisonnement (§3.5, §6.3)

| Mesure                                                           | État                                    |
| ---------------------------------------------------------------- | --------------------------------------- |
| Row Level Security PostgreSQL sur chaque table exposée           | Prévue — lot 1.1, alignée au lot 1.4    |
| Politiques CASL par rôle, refus par défaut, `@Roles` / `@Scope`  | Prévue — lot 1.4                        |
| Sérialisation par vue (un DTO par rôle demandeur)                | Prévue — lot 1.4                        |
| Test « rôle non autorisé → 403 » pour chaque endpoint (bloquant) | Prévue — lot 1.4 (matrice `rbac.md`)    |
| Rôles PostgreSQL séparés : `oz_migrator` (DDL) et `oz_app` (DML) | Partielle — Terraform, lot 0.8b ; D-038 |

## Authentification (§6.2, [ADR-002](../adr/ADR-002-authentification-proprietaire.md))

| Mesure                                                                          | État                                |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| Argon2id (m=19456, t=2, p=1), 12 caractères minimum, HaveIBeenPwned             | Prévue — lot 1.3                    |
| JWT 15 min en mémoire ; rafraîchissement en cookie `httpOnly` `Secure` `Strict` | Prévue — lot 1.3                    |
| Rotation du rafraîchissement, réutilisation = révocation de la famille          | Prévue — lot 1.3                    |
| Sessions listées et révocables ; délai exponentiel sans verrouillage définitif  | Prévue — lot 1.3                    |
| 2FA TOTP obligatoire : administrateurs, centres, fédérations                    | Prévue — lot 1.3                    |
| Vérification email avant toute action, SMS avant le KYC                         | Prévue — lots 1.3, 1.10             |
| Réponses indiscernables (compte existant ou non, CP-28)                         | Prévue — lot 1.3                    |
| Couverture de tests 100 % sur l'authentification (seuil CI bloquant, R6)        | En place — seuil dans le job `test` |

## Protection des mineurs (§6.7, bloquant)

| Règle                                                               | État                     |
| ------------------------------------------------------------------- | ------------------------ |
| Minorité recalculée à chaque requête, jamais dans le jeton          | Prévue — lots 1.3, 1.4   |
| Aucun profil de mineur indexé ni accessible anonymement (`noindex`) | Prévue — lot 1.13        |
| Consentement horodaté du tuteur avant toute publication             | Prévue — lot 1.7b        |
| Coordonnées directes d'un mineur jamais exposées, à aucun rôle      | Prévue — lots 1.4, 1.13  |
| Consultation par un recruteur journalisée et visible du tuteur      | Prévue — lots 1.13, 1.16 |
| Recruteur non vérifié : aucun accès aux profils de mineurs          | Prévue — lots 1.4, 1.10b |
| Bouton de signalement sur chaque profil, traitement sous 48 h       | Prévue — lots 1.11, 1.13 |

## OWASP Top 10 (§6.4)

| Risque                     | Mesures et état                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Contrôle d'accès       | Voir « Cloisonnement » : prévu, lots 1.1 et 1.4                                                                                                                                                                           |
| A02 Cryptographie          | En place : HSTS deux ans `preload` (API et web), TLS épinglé vers PostgreSQL (lot 0.8b, D-039 fermée). Partielle : TLS non imposé côté serveur PostgreSQL (D-041), Redis non testé (D-046). Prévue : `pgcrypto` (lot 1.1) |
| A03 Injection              | En place : Prisma paramétré, contrats Zod stricts (`@oz/contracts`), Semgrep en CI. Aucune requête SQL concaténée (revue de chaque lot)                                                                                   |
| A04 Conception             | En place : ce document, [modèle de menaces](threats.md), revue de sécurité en fin de lot (`/execute-phase`), ADR                                                                                                          |
| A05 Configuration          | En place : images distroless non-root (UID 65532), CSP stricte à nonce, CORS en liste blanche, `/docs` désactivé en production. Écarts : D-014, D-015, D-017, D-022                                                       |
| A06 Composants vulnérables | En place : Dependabot (sans auto-merge), `pnpm audit` ≥ high, Trivy (lockfile, images, IaC), `trustPolicy: no-downgrade`. Écarts : D-027, D-028, D-029, D-033                                                             |
| A07 Identification         | Voir « Authentification » : prévue, lot 1.3                                                                                                                                                                               |
| A08 Intégrité              | En place : lockfile figé, actions épinglées par empreinte, binaires CI vérifiés par SHA-256. Prévue : chaînage par hachage du journal d'audit (lot 1.16). Écart : CI non bloquante sur GitHub Free (D-030)                |
| A09 Journalisation         | En place : logs JSON pino, `requestId`, champs sensibles masqués (`REDACT_PATHS`). Écart : D-007. Prévus : alertes Sentry, conservation 12 mois (lots 1.16, 1.17)                                                         |
| A10 SSRF                   | Aucune récupération d'URL fournie par l'utilisateur ; toute exception future passera par une liste blanche                                                                                                                |

## En-têtes (§6.5)

En place, testés :

- API (`apps/api/src/common/security/security.ts`) : CSP `default-src 'none'`, HSTS,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`, CORS en liste
  blanche ;
- web et admin (`packages/config/src/security-headers.ts`, proxys Next, tests
  `security-headers.test.ts` et fumées Playwright) : CSP à nonce par requête, `frame-ancestors 'none'`,
  `object-src 'none'`, `noindex` sur l'admin.

Écarts ouverts : D-014 (attributs `style`), D-015 (pas de `report-to`), D-017 (réponses hors proxy).

## Limitation de débit (§6.6)

Prévue au lot 1.3 pour l'authentification et le KYC (valeurs §6.6), au lot 1.9 pour le
téléversement, au lot 1.14 pour la recherche (quotas par palier). La limite globale par IP
(Cloudflare) est posée avec la mise en ligne (lot 1.18).

## Téléversements (§6.1 n° 7)

Prévus au lot 1.9 : ClamAV, vérification du type MIME réel, ré-encodage des images, stockage hors du
domaine applicatif, URL signées valables 5 minutes, jamais d'URL publique permanente. ClamAV tourne
déjà dans les services locaux (`pnpm dev:up`).

## Chiffrement, secrets, sauvegardes (§6.9)

| Mesure                                                               | État                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TLS en transit, certificats automatiques                             | En place pour les données (lot 0.8b) ; HTTPS public au lot 1.18                     |
| Chiffrement disque chez l'hébergeur (Scaleway, Paris)                | En place — [ADR-003](../adr/ADR-003-postgresql-manage-residence.md)                 |
| Chiffrement colonne `pgcrypto` des champs d'identité                 | Prévue — lot 1.1 ; anonymisation à adapter (D-023)                                  |
| Secrets hors dépôt : gitleaks (hook pre-commit et CI), Trivy secrets | En place — contournable sur le poste (D-004)                                        |
| Secrets en coffre, rotation trimestrielle                            | Partielle — variables de l'hébergeur ; clé S3 dans l'état Terraform (D-037)         |
| Sauvegardes PostgreSQL quotidiennes, rétention                       | Partielle — RPO 15 min non garanti (D-035, bloquante pour la production)            |
| Stockage objets : versioning et réplication                          | Partielle — buckets de secours vides (D-034)                                        |
| Restauration testée, consignée en runbook                            | En place — [restauration-postgres.md](../runbooks/restauration-postgres.md) ; D-049 |

## Données et conformité (§6.8)

- Données personnelles : uniquement en production ; seeds synthétiques, anonymisation des copies
  (`pnpm db:anonymize`, D-023, D-024).
- Documents d'identité : conservation et purge selon
  [ADR-008](../adr/ADR-008-conservation-pieces-identite.md) (proposé, à valider avec l'avocat).
- Registre des traitements, procédure d'exercice des droits, notification d'incident sous 72 h,
  accords de sous-traitance : lot 1.16, avant l'ouverture des inscriptions.

## Gestion des incidents

1. Constater et contenir : révoquer les sessions ou clés concernées, isoler le service.
2. Qualifier : données touchées (mineurs ?), période, personnes concernées.
3. Notifier sous 72 h les autorités compétentes et, si nécessaire, les personnes (§6.8).
4. Corriger, puis documenter : chronologie, cause, mesures, ajout au [modèle de menaces](threats.md).

La procédure détaillée et les contacts des autorités sont livrés au lot 1.16.

## Revue

Cette politique est relue à chaque fin de lot touchant la sécurité, à chaque incident et au moins une
fois par trimestre. Une mesure ne passe « En place » qu'avec sa preuve.
