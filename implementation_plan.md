# OZ — Plan d'implémentation (implementation_plan.md)

**Sources :** `requirements.md` · `design.md` · `technology_decisions.md` · `docs/PLAN.md` (§8 lots, §9 dépendances)
**Date :** 2026-10-24 · **Statut :** Généré par `/tech-stack`

---

## 1. Vue d'ensemble

OZ est construit **de bas en haut, un lot à la fois** (§0.2, EX-T01). Chaque **phase d'implémentation de ce document correspond exactement à un lot du plan technique** et porte son numéro : on lance `/plan-phase 0.1`, `/execute-phase 0.1`, `/commit-phase 0.1`, puis `0.2`, etc. Un lot = une branche = une PR ≤ 800 lignes (R1). Si `/plan-phase` juge un lot trop gros (> 8 tâches ou plusieurs frontières système), il le découpe en `0.1a`, `0.1b`…

### 1.1 Précondition — Jalon J0 [BLOQUANT]

Aucune ligne de code, aucun dépôt, aucun accès environnement avant **J0** (§0.3) : NDA mutuel signé, contrat de développement et de cession de PI + convention de participation signés, premier versement encaissé. **À confirmer par Gaëtan Wassu avant `/plan-phase 0.1`.**

### 1.2 Adaptation du workflow des skills au plan technique

Le plan technique prévaut sur les skills (CLAUDE.md, D-K12).

| Skill | Comportement par défaut | Adaptation OZ |
|---|---|---|
| `/execute-phase` | TDD + revue adversariale | Inchangé ; la revue adversariale tient lieu de relecteur (EX-T14) |
| `/commit-phase` | Branche `phase-N-implementation`, merge direct dans `main` ou `staging`, push | Branche nommée selon §2.3 (`feat/p<phase>-<module>-<description>`) ; push puis **PR vers `develop`** (brouillon dès le premier push) ; **squash merge** après CI verte et approbation de Gaëtan Wassu ; jamais de merge direct dans `main` ; `main` ne reçoit que des `release/*` et `hotfix/*` |
| Dependabot | Auto-merge des mises à jour mineures | **Pas d'auto-merge** (R12, R14) : PR groupée mensuelle, revue et approuvée |

Toute action `git push` ou merge est confirmée par Gaëtan Wassu au moment de l'exécuter.

### 1.3 Parallélisation

Le §9 sépare deux chaînes : **A** (données, sécurité, KYC, back-office) et **B** (design system, parcours, import, recherche). Elles peuvent avancer dans deux sessions distinctes, chacune sur sa branche. Seul `packages/contracts` est partagé : toute modification y est annoncée avant d'être poussée.

---

## 2. Prérequis : décisions technologiques

Terminées — voir `technology_decisions.md` (TD-001 à TD-017).

---

## 3. PHASE 0 — FONDATIONS (lots 0.1 à 0.11) → Jalon J1

### Phase 0.1 — Monorepo et outillage qualité · Chaîne A
**Goal :** un monorepo TypeScript strict qui se construit, se lint et se teste sur un poste vierge.
**Tasks :**
1. Initialiser le dépôt Git, `main` et `develop` protégées, `.gitattributes` (LF)
2. pnpm workspaces + Turborepo ; arborescence §3.3 (`apps/{web,admin,api,worker}`, `packages/{contracts,db,ui,core,auth,config,testing}`, `infra/`, `docs/`)
3. TypeScript strict partagé (`tsconfig` de base), ESLint, Prettier
4. Husky + lint-staged + commitlint (Conventional Commits) + gitleaks en pre-commit
5. Vitest configuré à la racine, un test d'exemple par paquet
6. `DEPENDENCIES.md`, `DEBT.md`, `CHANGELOG.md` initialisés ; `.github/dependabot.yml` (§10 Maintenance)
**Deliverable :** `pnpm install && pnpm build && pnpm lint && pnpm test` passe sur un clone neuf. **Exigences :** EX-001, EX-T02, EX-T05, EX-T08, EX-T12.

### Phase 0.2 — Environnement de développement conteneurisé · A
**Goal :** un seul `docker compose up` lève tous les services.
**Tasks :**
1. `infra/docker/compose.dev.yml` : PostgreSQL (version alignée sur Scaleway), Redis, MinIO, ClamAV, Mailpit
2. Volumes nommés, healthchecks, ports documentés
3. `.env.example` (Annexe C du plan, complété des fournisseurs TD-011 à TD-015)
4. Script `pnpm dev:up` / `dev:down` / `dev:reset`
**Deliverable :** services sains en < 2 min sur macOS. **Exigences :** EX-002, EX-T08.

### Phase 0.3 — Squelette d'API NestJS · A
**Goal :** une API qui démarre, se décrit et répond à `/health`.
**Tasks :**
1. `apps/api` NestJS ; `packages/config` : configuration typée validée par Zod (démarrage refusé si invalide)
2. Filtre d'exceptions global → format d'erreur normalisé (code, message, `requestId`, détails)
3. Middleware `requestId` + logs JSON (pino), sans donnée personnelle
4. `/health` (base, Redis, stockage) ; Swagger `/docs` en local et recette seulement
5. En-têtes de sécurité (§6.5), CORS en liste blanche
**Deliverable :** `/health` et `/docs` répondent ; test d'intégration du format d'erreur. **Exigences :** EX-003, EX-T07, EX-T17, EX-T19.

### Phase 0.4 — Squelette web Next.js · B
**Goal :** une application web sombre, internationalisée, déployable.
**Tasks :**
1. `apps/web` Next.js App Router + Tailwind ; `apps/admin` squelette
2. Jetons de `design.md` §8.3 dans `packages/ui` (variables CSS + thème Tailwind)
3. Polices auto-hébergées sous-ensemblées (Inter, Inter Tight, JetBrains Mono — R12)
4. i18n : français par défaut, anglais préparé
5. Layout de base, page d'accueil provisoire, CSP avec nonce
**Deliverable :** page d'accueil sombre aux jetons OZ, prête à être déployée en recette (0.8). **Exigences :** EX-004, EX-T21, EX-T22.

### Phase 0.5 — Contrats partagés · A + B
**Goal :** un même schéma Zod valide un formulaire et un endpoint.
**Tasks :**
1. Conventions de `packages/contracts` (un dossier par ressource, `*.schema.ts`, export des types)
2. `ZodValidationPipe` NestJS : 422 avant toute logique, `strict()`
3. Premier schéma partagé (ex. formulaire de contact) consommé par web et API
4. Tests de contrat formulaire ↔ schéma
**Deliverable :** démonstration du double contrôle C1/C2. **Exigences :** EX-005, EX-T04 (CP-05, CP-06).

### Phase 0.6 — Base de données initiale · A
**Goal :** Prisma opérationnel avec migrations réversibles et données synthétiques.
**Tasks :**
1. `packages/db` : schéma Prisma initial (table technique minimale), extensions `pgcrypto`, `pg_trgm`, `unaccent`, UUIDv7
2. Convention de migration `up`/`down` (SQL brut pour RLS, partitionnement, chiffrement)
3. Factories déterministes dans `packages/testing` ; seeds synthétiques
4. Script d'anonymisation versionné + test prouvant l'absence de donnée réelle
**Deliverable :** migration `up` puis `down` testée. **Exigences :** EX-006, EX-T09, EX-T10.

### Phase 0.7 — Intégration continue · A
**Goal :** aucune PR ne passe si un seul contrôle échoue.
**Tasks :**
1. Workflow GitHub Actions : install (cache pnpm + Turbo), lint, format, commitlint, typecheck
2. Tests unitaires avec seuils de couverture R6 ; intégration Testcontainers
3. Build de toutes les apps ; gitleaks, `pnpm audit`, Trivy, CodeQL (bloquant haute/critique)
4. Vérification des migrations `up` puis `down`
5. Protection de branches : CI verte + approbation requises
**Deliverable :** PR de test bloquée par un contrôle volontairement cassé. **Exigences :** EX-007, EX-T03, EX-T06.

### Phase 0.8 — Environnements et déploiement · A
**Goal :** `develop` se déploie seul en recette ; chaque PR a sa prévisualisation.
**Tasks :**
1. Terraform (provider Scaleway) : Instances, PostgreSQL managé (recette, production), Object Storage (buckets séparés, versioning, copie de secours), Redis (managé ou conteneur, à trancher), secrets
2. Coolify : apps api, web, admin, worker, ClamAV ; prévisualisation par PR détruite au merge
3. Cloudflare : DNS, TLS, CDN, WAF, limitation globale ; recette protégée par mot de passe
4. Email : domaine Scaleway TEM, SPF, DKIM, DMARC
5. Déploiement auto de `develop` en recette + migrations + fumage
**Deliverable :** un merge sur `develop` apparaît en recette sans intervention. **Exigences :** EX-008, EX-T23 (partiel), TD-009 à TD-011.

### Phase 0.9 — Observabilité de base · A
**Goal :** une erreur provoquée remonte avec sa trace.
**Tasks :**
1. Sentry (région UE) sur web, admin, API, worker, avec nettoyage des données personnelles
2. Envoi des logs JSON vers Scaleway Cockpit ; vérifier la rétention 12 mois (sinon archivage)
3. Sondes Better Stack sur accueil et `/health`
4. Premières alertes du §12.2 (5xx, latence, disque)
**Deliverable :** erreur volontaire visible dans Sentry avec `requestId`. **Exigences :** EX-009, EX-T19, TD-014.

### Phase 0.10 — Design system initial · B
**Goal :** Storybook déployé avec les 8 composants de base.
**Tasks :**
1. Storybook 8 dans `packages/ui`, thème OZ sombre
2. Composants shadcn/Radix adaptés : bouton (principal, secondaire, désactivé), champ, sélecteur, carte, badge, tableau, modale, notification
3. États : repos, focus, actif, désactivé, erreur, chargement ; effets E3, E4, E5 avec repli `prefers-reduced-motion`
4. Tests axe-core dans Storybook
**Deliverable :** Storybook en ligne, 8 composants documentés. **Exigences :** EX-010, `design.md` §8.11 (livrables 1-2).

### Phase 0.11 — Documentation fondatrice · A + B
**Goal :** les décisions et règles sont écrites et mergées.
**Tasks :**
1. ADR 001 à 008 (modèle Annexe A), alimentés par TD-001 à TD-017
2. `CONTRIBUTING.md` (workflow §1.2 de ce document), `SECURITY.md`, modèle de PR (Annexe B)
3. `docs/security/policy.md` et `docs/security/threats.md`
4. `docs/PLAN.md` (plan d'exécution versionné)
**Deliverable :** documents mergés. **Exigences :** EX-011.

**[JALON J1]** — Une modification poussée déclenche la CI, produit une prévisualisation et se déploie en recette après merge.

---

## 4. PHASE 1 — WEB PUBLIC, INSCRIPTIONS, CHARGEMENT DES DONNÉES (lots 1.1 à 1.18) → Jalon J2

### Phase 1.1 — Modèle de données du socle · A
**Goal :** toutes les tables de Phase 1, protégées et réversibles.
**Tasks :**
1. Tables `users`, `user_roles`, `sessions`, `players`, `guardians`, `organizations`, `documents`, `kyc_cases`, `consents`, `audit_log` (partitionnée), `notifications`, `imports`, `subscriptions`
2. Contraintes `CHECK` (âge 6 ans, énumérations, formats), clés étrangères, `UNIQUE`
3. RLS sur chaque table exposée ; colonnes chiffrées `pgcrypto`
4. Index de recherche (`search_vector`, GIN, trigrammes)
5. Seeds : 500 profils synthétiques ; diagramme ER dans `docs/data/`
**Deliverable :** migration réversible testée, RLS testée en intégration. **Exigences :** EX-101, EX-T11, EX-T20.

### Phase 1.2 — Générateur et registre OZ ID · A
**Goal :** des OZ ID uniques, dictables, vérifiables hors ligne.
**Tasks :**
1. `packages/core` : génération base 32 Crockford, checksum de Damm (TD-017), table figée + empreinte
2. Validation hors ligne ; tests exhaustifs (erreurs simples, inversions voisines)
3. Registre : réservation atomique, non-réattribution, conservation après suppression
4. Génération du QR du profil
5. Test de charge : 1 000 000 d'identifiants sans collision
**Deliverable :** CP-01 à CP-04 verts, couverture 100 %. **Exigences :** EX-102.

### Phase 1.3 — Authentification et sessions · A
**Goal :** des comptes sûrs, des sessions maîtrisées.
**Tasks :**
1. Inscription, confirmation d'email, connexion, déconnexion (simple et globale), réinitialisation
2. Argon2id + vérification HaveIBeenPwned (k-anonymité) ; délai exponentiel
3. JWT 15 min + refresh en cookie, rotation et détection de réutilisation (révocation de famille)
4. Sessions listées et révocables ; 2FA TOTP (obligatoire admins, centres, fédérations)
5. OTP via `SmsProvider` (Infobip WhatsApp → SMS, repli Twilio) ; reCAPTCHA v3, piège, chronométrie
6. Limitation de débit (§6.6) ; réponses indiscernables (CP-28)
**Deliverable :** couverture 100 %, E2E n° 7 et n° 8. **Exigences :** EX-103, EX-T18, TD-005, TD-012.

### Phase 1.4 — Rôles, permissions, cloisonnement · A
**Goal :** chaque rôle ne reçoit que ce qu'il a le droit de voir.
**Tasks :**
1. Rôles (7 profils + admin) et portée par organisation
2. Politiques CASL alignées sur la matrice EX-104 (Annexe B du DP)
3. RLS PostgreSQL alignée ; sérialisation par vue
4. Décorateurs `@Roles`, `@Scope` ; refus par défaut
5. Suite de tests générée depuis `docs/security/rbac.md` : chaque couple (rôle, endpoint)
**Deliverable :** matrice exhaustive verte (CP-07 à CP-12). **Exigences :** EX-104, EX-T04, EX-T16.

### Phase 1.5 — Design system et coquille applicative · B
**Goal :** l'identité visuelle tranchée et tous les composants prêts.
**Tasks :**
1. ADR d'identité visuelle (deux registres, nom de marque Q19, place de l'or Q6)
2. Composants du `design.md` §8.6 (cartes de choix, OTP, progression, badges, carte OZ ID, anneaux, barres, puces, onglets)
3. Bibliothèque d'effets E1 à E22 avec replis et mesure de coût
4. Coquille : navigation par rôle (§8.8), états de chargement (squelettes) et d'erreur
5. Audit Lighthouse ≥ 90, axe-core, 320 px, 3G simulée
**Deliverable :** Storybook complet. **Exigences :** EX-105, EX-T22, `design.md` §8.11.

### Phase 1.6 — Site public et pages légales · B
**Goal :** OZ existe publiquement, avec ses documents légaux.
**Tasks :**
1. Accueil (registre Émotion), pages par profil (7), tarifs (paliers DP §13.3), à propos, contact
2. Mentions légales, politique de confidentialité, CGU (textes fournis par le juriste — Q7)
3. SEO, métadonnées sociales, sitemap ; `robots.txt` interdisant tout profil
4. Corriger les écarts M4, M5, M7 des maquettes
**Deliverable :** Lighthouse performance ≥ 85 mobile ; pages légales publiées [BLOQUANT]. **Exigences :** EX-106.

### Phase 1.7 — Inscription joueur et OZ ID · B
**Goal :** un joueur obtient son OZ ID, même sur connexion instable.
**Tasks :**
1. Parcours écrans 02-06 : compte → identité → sport → rattachement → tuteur si mineur → photo
2. Sauvegarde serveur par étape, reprise après interruption
3. Détection de minorité à la saisie (effet E6), bloc tuteur bloquant
4. Attribution de l'OZ ID (`DECLARED`), carte OZ ID (effets E1, E2)
5. Parrainage par lien d'organisation (P3) ; score de complétude (P4)
**Deliverable :** E2E majeur, mineur, reprise. **Exigences :** EX-107, EX-119 (partiel), EX-120, EX-121.

### Phase 1.7b — Tuteur légal · B
**Goal :** le tuteur s'inscrit, se fait vérifier et consent.
**Tasks :**
1. Invitation par WhatsApp/SMS/email depuis le parcours mineur
2. Inscription tuteur, déclaration du lien, justificatif
3. Consentement versionné, horodaté serveur, révocable (dépublication immédiate)
4. Rattachement à plusieurs enfants
**Deliverable :** E2E n° 2 jusqu'au blocage de publication. **Exigences :** EX-108, CP-13.

### Phase 1.8 — Inscription organisation · B
**Goal :** les 6 types d'organisation s'inscrivent.
**Tasks :**
1. Formulaires différenciés (académie, club, fédération, centre, recruteur, agence)
2. Justificatifs par type ; rattachement du dirigeant
3. Invitations de membres avec rôle interne
**Deliverable :** un compte de chaque type validé en recette. **Exigences :** EX-109.

### Phase 1.9 — Téléversement et coffre documentaire · A
**Goal :** aucun fichier dangereux n'atteint un utilisateur.
**Tasks :**
1. URL de téléversement signées à usage unique, envoi direct au stockage
2. Vérifications serveur (MIME réel, taille, dimensions, pages), SHA-256
3. Worker : ClamAV, ré-encodage, suppression EXIF, empreinte perceptuelle
4. Accès par URL signée 5 min ; purge programmée (`retention_until`)
**Deliverable :** EICAR rejeté, image piégée neutralisée, E2E n° 10. **Exigences :** EX-110, CP-20 à CP-22.

### Phase 1.10 — KYC niveaux 0 à 2 · A
**Goal :** le badge « Profil vérifié » ne s'obtient pas frauduleusement.
**Tasks :**
1. **AIPD validée** (prérequis) ; POC Veriff / Smile ID en bac à sable → choix du fournisseur (TD-015)
2. Interface `IdentityVerifier` + validation Zod des réponses
3. Pipeline asynchrone, concordance déclaratif ↔ OCR, score de risque versionné
4. Aiguillage TD-016 (rejet déterministe seulement, revue humaine par défaut, drapeau `kyc.autoApproveAdults` inactif)
5. Machine à états du §5.4 ; revérification à 24 mois ; 3 rejets → blocage 30 jours
6. 100 dossiers synthétiques dont fraudes préparées
**Deliverable :** CP-16 à CP-19 et CP-17b verts. **Exigences :** EX-111, EX-T24 n° 6, TD-015, TD-016.

### Phase 1.10b — KYC 3 organisationnel · A
**Goal :** recruteurs, agences, centres et fédérations vérifiés avant tout accès sensible.
**Tasks :**
1. Justificatifs par type (licence, mandat, licence d'agent, convention)
2. Revue manuelle à quatre yeux ; 2FA requise pour les centres
3. Effet sur les droits (accès aux mineurs, recherche)
**Deliverable :** E2E n° 5 possible. **Exigences :** EX-112 (Q2 à confirmer).

### Phase 1.11 — Back-office d'administration · A
**Goal :** un dossier traité en moins de 90 s, tout tracé.
**Tasks :**
1. File KYC priorisée ; écran de décision (écarts surlignés)
2. Décision motivée ; quatre yeux (second admin distinct)
3. Comptes, rôles, suspension ; journal d'audit consultable ; tableau de bord opérationnel
4. 2FA obligatoire ; guide `docs/guides/admin.md`
**Deliverable :** E2E n° 6 ; chronométrage < 90 s. **Exigences :** EX-113.

### Phase 1.12 — Import de masse · B
**Goal :** une académie charge 10 000 joueurs en moins de 5 minutes, annulable 72 h.
**Tasks :**
1. Lecture CSV / Excel ; assistant de correspondance mémorisée
2. Passe à blanc (rapport ligne par ligne) ; confirmation explicite
3. Exécution en file avec progression temps réel ; dédoublonnage ; OZ ID en `DECLARED`
4. Photos par ZIP ; rapport téléchargeable ; annulation en une opération
5. Guide `docs/guides/academy.md`
**Deliverable :** E2E n° 3 ; CP-24 à CP-26. **Exigences :** EX-114.

### Phase 1.13 — Profil joueur et visibilité · B
**Goal :** chaque rôle voit le bon profil, et rien de plus.
**Tasks :**
1. Fiche joueur (onglets aperçu, carrière ; stats et tests en Phase 2) sans OZ Score (Q18)
2. Badges KYC (effet E13 après confirmation serveur), réglages de visibilité
3. Carte OZ ID PDF (P1), export PDF filigrané
4. Test d'inspection de payload pour les 7 rôles
**Deliverable :** CP-10, CP-11 verts. **Exigences :** EX-115, EX-119.

### Phase 1.14 — Recherche v1 · B
**Goal :** trouver un profil en quelques secondes, sans jamais exposer un mineur à tort.
**Tasks :**
1. Filtres (§lot 1.14), tri, pagination par curseur
2. Recherches sauvegardées ; export CSV filigrané et quota (palier gratuit par défaut)
3. Exclusion des mineurs pour recruteurs/agences sans KYC 3 ; journalisation des consultations
4. Test de performance : p95 < 300 ms sur 100 000 profils
**Deliverable :** E2E n° 4 et n° 5. **Exigences :** EX-116, CP-12, CP-14.

### Phase 1.15 — Notifications et emails · B
**Goal :** chaque événement important est notifié, de façon fiable.
**Tasks :**
1. Gabarits React Email ; envoi par file via `EmailProvider` (Scaleway TEM)
2. Événements de EX-117 ; préférences et désinscription
3. Tests sur Gmail, Outlook, Yahoo ; mesure de délivrabilité
**Deliverable :** délivrabilité mesurée et consignée. **Exigences :** EX-117, TD-011.

### Phase 1.16 — Journal d'audit et RGPD · A
**Goal :** traçabilité inaltérable et droits des personnes exercés.
**Tasks :**
1. Hash chaîné + vérification de chaîne (CP-23) ; consultation back-office
2. Export des données personnelles ; suppression avec anonymisation (OZ ID réservé)
3. Registre des traitements `docs/security/gdpr-register.md`
**Deliverable :** E2E n° 9. **Exigences :** EX-118, EX-T11.

### Phase 1.17 — Durcissement, charge, recette · A + B
**Goal :** prêt pour le public.
**Tasks :**
1. k6 : 200 utilisateurs simultanés (inscription, recherche, téléversement)
2. Test d'intrusion interne (grille §6.4) et corrections
3. Runbooks §10.4 ; restauration de sauvegarde réelle ; plan de bascule
4. `/harmonize` puis `/comprehensive-test` ; `/ai-governance audit`
**Deliverable :** aucune vulnérabilité haute ouverte ; procès-verbal de restauration. **Exigences :** EX-123.

### Phase 1.18 — Mise en production · A + B
**Goal :** ouverture des inscriptions.
**Tasks :**
1. Checklist Annexe D ; `release/1.0.0` ; sauvegarde avant migration
2. Déploiement bleu-vert ; fumage des 10 parcours
3. Liste d'attente puis ouverture générale ; surveillance 72 h
4. Tableau de bord KPI (`requirements.md` §5)
**Deliverable :** **[JALON J2]**. **Exigences :** EX-124.

---

## 5. PHASE 2 — GESTION, MÉMOIRE, MOBILE (lots 2.1 à 2.12) → Jalon J3

| Phase | Goal | Tasks principales | Deliverable | Exigences |
|---|---|---|---|---|
| **2.1** Catalogue de tests | Mesurer selon un protocole standard | 6 tests ; sessions ; bornes Annexe E **validées par un préparateur (Q13)** ; marquage `À CONFIRMER` | CP-30 vert | EX-201 |
| **2.2** Certification centre | Des mesures incontestables | 2FA centre KYC 3 ; scan QR (effet E9) ; signature de session ; révisions | CP-29 vert | EX-202 |
| **2.3** Soumission externe | Un talent isolé peut exister | Preuve PV / vidéo ; contrôles auto (TD-016 consultatif) ; statuts distincts | CP-31 vert | EX-203 |
| **2.4** Progression et cohorte | Lire une progression | Courbes ; percentiles ; source visible ; radar (E11) | Écran 24 | EX-204 |
| **2.5** Effectifs | Gérer un effectif | Affectations, mouvements confirmés des deux côtés | Mouvement E2E | EX-205 |
| **2.6** Historique | Une carrière sans rupture | Chronologie automatique, niveaux de vérification | Traçabilité FIFA art. 19 | EX-206 |
| **2.7** Tableau de bord académie | Piloter son vivier | Indicateurs (EX-207) | Démo M. Ngassa | EX-207 |
| **2.8** Tableau de bord club | Piloter son effectif | Indicateurs (EX-208) | Démo | EX-208 |
| **2.9** Tableau de bord fédération | Carte nationale du talent | Agrégats, appui licences, mode observateur | Démo DTN | EX-209 |
| **2.10** Abonnements | Encaisser | Paliers DP §13.3 ; Stripe + CinetPay ; prépayé mobile money ; quotas ; factures (Q20) | CP-32, CP-33 ; couverture 100 % | EX-210, TD-013 |
| **2.11** Application mobile | Le terrain dans la poche | Expo ; profil, soumission, recherche rapide, notifications ; Keychain/Keystore | Builds stores internes | EX-211, TD-007 |
| **2.12** Recherche v2 | Chercher par la performance | Critères VMA, sprint ; comparaison | p95 < 300 ms | EX-212 |
| **2.x** Propositions P5, P6, P10, P11 | Si validées par Fabrice Olinga | Portail tuteur, attestation PDF, journal de consultation, observateur | — | EX-213 à EX-215, EX-209 |

Chaque ligne est détaillée par `/plan-phase 2.N` au démarrage. **[JALON J3]**

---

## 6. PHASE 3 — INTELLIGENCE (lots 3.1 à 3.7) → Jalon J4

| Phase | Goal | Tasks principales | Exigences |
|---|---|---|---|
| **3.1** Meilisearch | Recherche à l'échelle | Bascule au seuil (200 000 profils ou p95 > 300 ms) ; index sans champ interdit | EX-301 |
| **3.2** Comparaison | Profils similaires | Similarité explicable, radar | EX-302 |
| **3.3** Scoring de potentiel | Aide à la lecture | Modèle explicable, facteurs + incertitude, contestable ; décision LLM éventuelle (TD-015) | EX-303, TD-016 |
| **3.4** Rapports PDF | Dossiers prêts à envoyer | Génération asynchrone, filigrane | EX-304 |
| **3.5** Analytique | Cohortes, institutions | Seuil anti-réidentification | EX-305 |
| **3.6** Fraude statistique | Protéger le badge | Dérive des centres → audit humain | EX-306 |
| **3.7** Échelle | Tenir la charge | Réplicas, mise à l'échelle, requêtes ; RTO/RPO durcis | EX-307 |

**[JALON J4]**

---

## 7. PHASE 4 — RELATION ET PREUVE (lots 4.1 à 4.5) → Jalon J5

| Phase | Goal | Exigences |
|---|---|---|
| **4.1** Module vidéo (transcodage adaptatif, CDN, débit faible) | La preuve en images | EX-401 |
| **4.2** Séquences et temps forts | Valoriser | EX-402 |
| **4.3** Vérification vidéo renforcée | Preuve fiable | EX-403 |
| **4.4** Messagerie encadrée (jamais de contact direct avec un mineur) | Relation tracée | EX-404 |
| **4.5** Demandes de contact structurées | Mise en relation mesurée | EX-405 |

**[JALON J5]**

---

## 8. PHASE 5 — ÉCOSYSTÈME (lots 5.1 à 5.6) → Jalon J6

| Phase | Goal | Exigences |
|---|---|---|
| **5.1** OZ Legal | Protéger juridiquement | EX-501 |
| **5.2** OZ Career | Orienter | EX-502 |
| **5.3** Marketplace | Services vérifiés | EX-503 |
| **5.4** OZ Band | Données de terrain continues | EX-504 |
| **5.5** API publique | Écosystème partenaire | EX-505 |
| **5.6** Multilingue, multi-pays (+ Flutterwave) | Expansion | EX-506 |

Les exigences de Phase 5 sont marquées [À CONFIRMER] : un `/kickoff` ciblé est recommandé au démarrage de la phase. **[JALON J6]**

---

## 9. Dépendances entre phases

```
J0 ─► 0.1 ─► 0.2 ─► 0.3 ─┬─► 0.5 ─► 0.6 ─► 0.7 ─► 0.8 ─► 0.9 ─► 0.11 ─► [J1]
                         └─► 0.4 ─► 0.10 ────────────────────────────┘

1.1 ─┬─► 1.2 ──────────────────────────────► 1.7 ─► 1.7b
     ├─► 1.3 ─► 1.4 ─┬─► 1.9 ─► 1.10 ─► 1.10b ─► 1.11
     │               ├─► 1.13 ─► 1.14
     │               └─► 1.16
     └─► 1.5 ─┬─► 1.6
              ├─► 1.7 ─► 1.8 ─► 1.12
              └─► 1.15
1.11 + 1.12 + 1.14 ─► 1.17 ─► 1.18 ─► [J2]

Phase 2 : 2.1 ◄ 1.4, 1.10 · 2.2/2.3/2.4 ◄ 2.1 · 2.5 ◄ 1.8 · 2.6 ◄ 2.5 · 2.7/2.8 ◄ 2.5 + 2.1
          2.9 ◄ 2.5 · 2.10 ◄ 1.4 · 2.11 ◄ API Ph. 1-2 · 2.12 ◄ 2.1 + 1.14
```

**Chemin critique de Phase 1 :** 1.1 → 1.3 → 1.4 → 1.9 → 1.10 → 1.10b → 1.11 → 1.17 → 1.18.

---

## 10. Risques et atténuations

| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| Ta capacité de revue devient le goulot (seul approbateur, deux chaînes en parallèle) | Haute | Haute | PR ≤ 800 lignes ; revue adversariale avant toi ; résumé de revue en tête de PR ; une seule chaîne active si la file de revue dépasse 3 PR |
| Fournisseur KYC inadapté aux documents camerounais | Moyenne | Haute | POC en bac à sable avant engagement (TD-015) ; interface `IdentityVerifier` |
| AIPD non prête → lot 1.10 bloqué | Moyenne | Haute | Lancer l'AIPD pendant la Phase 0 |
| Charge de revue KYC humaine (TD-016) | Haute | Moyenne | Écran < 90 s ; priorisation ; activation progressive du drapeau sur preuve |
| Délivrabilité SMS / WhatsApp au Cameroun | Moyenne | Haute | Double canal, double fournisseur, mesure au lot 1.3 |
| Périmètre Phase 1 contesté (DP vs plan, Q15) | Moyenne | Haute | Faire valider Q15 par Fabrice Olinga avant J1 |
| Textes légaux non prêts (Q7) | Moyenne | Bloquant | Engager le juriste dès J0 |
| Environnement macOS ≠ production Linux | Faible | Moyenne | Tout en conteneur ; CI sur Linux ; Testcontainers |
| Versions d'outils plus récentes que le plan | Haute | Faible | Versions stables du moment au lot 0.1, consignées (`technology_decisions.md`) |
| Effets visuels coûteux sur appareils modestes | Moyenne | Moyenne | Budget `transform`/`opacity`, replis, mesure par effet (`design.md` §8.7) |

---

## 11. Critères de succès

**Phase 1 (J2)** — les 10 critères d'acceptation de `requirements.md` (EX-124), et :
- [ ] Les 10 parcours E2E du §11.2 sont verts en CI
- [ ] Les propriétés CP-01 à CP-33 et CP-17b sont testées et vertes
- [ ] Couverture conforme à R6
- [ ] `/ai-governance audit` conforme à TD-016
- [ ] Aucune question bloquante de `requirements.md` §6.1 restée ouverte pour un lot livré
- [ ] Cibles d'adoption (`requirements.md` §5) instrumentées dans le tableau de bord

**Projet complet** — jalons J1 à J6 validés en revue de phase, documentation du §15 du plan livrée, dossier de transfert de compétences (`docs/handover/`).

---

## Maintenance

> Politique standard du skill, **adaptée aux règles R12 (dépendances auditées) et R14 (aucun merge sans approbation)** du plan technique : pas d'auto-merge.

### Dependency Updates

**Dependabot configuration** — créer `.github/dependabot.yml` pendant la Phase 0.1 (scaffolding) :
- Schedule : `monthly` (aligné sur la revue mensuelle des dépendances, §13.1 du plan)
- Grouper toutes les dépendances en une seule PR par écosystème (`npm` pour pnpm, `github-actions`, `docker`)
- `open-pull-requests-limit: 5`
- Cible : `develop`

**Pas d'auto-merge** — le workflow `dependabot-auto-merge.yml` du modèle standard **n'est pas créé** :
- Chaque PR Dependabot passe la CI complète, met à jour `DEPENDENCIES.md` (R12) et attend l'approbation de Gaëtan Wassu
- Les montées de version majeures font l'objet d'une phase dédiée (`chore/…`) avec revue adversariale

**Stratégie d'épinglage :**
- `^x.y.z` pour les dépendances applicatives ; `pnpm-lock.yaml` figé et versionné (A08)
- Versions exactes pour les outils dont le comportement casse le build (ESLint, Prettier, TypeScript, Prisma CLI)
- Images Docker épinglées par version (et par empreinte en production)

### Cycle de maintenance

**Mensuel** (revue des dépendances, §13.1) :
1. Merger la PR Dependabot groupée après revue
2. Revue `pg_stat_statements` : top 20 des requêtes (§13.1)
3. Vérifier le test de restauration mensuel (EX-T23)

**Trimestriel :**
1. Rotation des secrets (EX-T08)
2. Dates de fin de vie des runtimes (Node.js, PostgreSQL) — monter de version si < 6 mois
3. Annonces de l'hébergeur et des fournisseurs (Scaleway, Infobip, CinetPay, Stripe, fournisseur KYC)
4. Tech radar (§13.1) ; suite de tests complète et déploiement

**Exception :** avis de sécurité critique ou haute → correction sous 1 semaine (et blocage CI immédiat via Trivy / `pnpm audit`).

### Ce qui n'a pas besoin de mises à jour régulières

- Services managés (PostgreSQL Scaleway, Object Storage, Cockpit) — aucune action sauf changement cassant annoncé
- Runtimes — annuellement, ou à l'approche de la fin de vie
- Outils de développement (linters, formateurs) — seulement s'ils bloquent quelque chose
- La table de Damm de l'OZ ID — **jamais** (TD-017)
