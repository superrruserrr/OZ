# OZ — PLAN D'EXÉCUTION TECHNIQUE FORCÉ

**Référence :** OZ-PETF-2026-001
**Document maître d'exécution — annexe technique au Document de Projet v1.0**
**Porteur produit :** Fabrice Olinga · **Direction technique & production :** Gaëtan Wassu / EXISTE
**Version :** 1.0 · **Statut :** CONFIDENTIEL — soumis au NDA · **Date :** Août 2026

---

## 0. Préambule et mode d'emploi

### 0.1 Objet du document

Le *Document de Projet v1.0* décrit **le pourquoi, le pour qui et le quoi**. Le présent document décrit **le comment, dans quel ordre, avec quoi, et selon quelles règles**. Il est la référence unique d'exécution : tout arbitrage technique, tout ordre de développement, toute mise en production s'y réfère.

Il couvre : la stack complète, l'architecture, le découpage exact en phases et en lots, la répartition du travail entre deux intervenants, la stratégie Git, la sécurité, le KYC et la double vérification client/serveur, l'infrastructure, la qualité, l'exploitation et l'amélioration continue.

### 0.2 Ce qu'est un « plan forcé »

Un plan forcé signifie que **l'ordre de construction n'est pas négociable en cours de route**. On construit de bas en haut, couche par couche, module par module. Une couche N+1 ne démarre pas tant que la couche N n'est pas mergée, testée, documentée et déployée en environnement de recette.

Conséquence directe : **aucun module n'est « à moitié fait »**. À tout instant du projet, la branche `main` est déployable et fonctionnelle. C'est la seule manière d'arriver en fin de projet « sans erreur et sans rien qui traîne ».

### 0.3 Déclencheur d'exécution

L'exécution démarre à la réunion de trois conditions cumulatives :

1. Signature du NDA mutuel ;
2. Signature du contrat de développement et de cession de PI, et de la convention de participation ;
3. Encaissement effectif du **premier versement** (jalon J0).

Tant que ces trois conditions ne sont pas réunies, aucun dépôt de code, aucun accès environnement, aucune donnée réelle ne circule.

### 0.4 Portée de la Phase 1 (rappel de la commande)

> **La Phase 1 livre une application web publique permettant les inscriptions sur la plateforme et le chargement / la reprise des données des inscrits.**

Pas d'application mobile en Phase 1. Le mobile arrive en Phase 2 et consomme la même API — c'est pourquoi l'API est conçue « mobile-ready » dès le premier jour.

### 0.5 Conventions du document

| Marqueur | Signification |
|---|---|
| **[BLOQUANT]** | Ne peut pas être contourné, arbitré ou reporté |
| **[JALON]** | Point de validation formel, conditionne un versement ou l'ouverture de la phase suivante |
| **[DoD]** | Definition of Done — critères de clôture d'un lot |
| **[ADR]** | Décision d'architecture à consigner dans un Architecture Decision Record |

---

## 1. Les règles d'exécution non négociables

Ces quatorze règles constituent le contrat technique entre les deux intervenants. Elles s'appliquent à chaque ligne de code produite.

**R1 — Une branche = un module = une Pull Request.** [BLOQUANT]
Pas de branche fourre-tout. Pas de PR de plus de 800 lignes modifiées hors fichiers générés. Une PR qui dépasse est découpée.

**R2 — `main` est toujours vert et déployable.** [BLOQUANT]
Aucun merge si la CI échoue. Aucun merge sans revue croisée approuvée. Aucun `--force` sur `main` ni sur `develop`.

**R3 — Bottom-up strict.** [BLOQUANT]
Ordre imposé : Infrastructure → Base de données → Domaine → API → Contrats partagés → Interface → Fonctionnalité. On ne développe jamais un écran dont l'endpoint n'existe pas et n'est pas testé.

**R4 — Le serveur est la seule source de vérité.** [BLOQUANT]
Toute validation effectuée côté client est **rejouée intégralement côté serveur**. Le client valide pour l'expérience utilisateur ; le serveur valide pour la sécurité. Voir chapitre 7.

**R5 — Zéro dette technique reportée.**
Un `TODO`, `FIXME` ou `any` TypeScript non justifié bloque la PR. Si une dette est acceptée, elle est consignée dans `DEBT.md` avec une échéance ferme et un responsable nommé.

**R6 — Tout code produit est testé.**
Seuils bloquants en CI : 80 % de couverture sur la couche domaine et services, 70 % global, 100 % sur les modules d'authentification, de KYC et de facturation.

**R7 — Tout endpoint est documenté à la création.**
Schéma OpenAPI généré automatiquement, exemples de requêtes et de réponses, codes d'erreur normalisés. Un endpoint non documenté n'existe pas.

**R8 — Aucun secret dans le dépôt.** [BLOQUANT]
Détection automatique (`gitleaks`) en pre-commit et en CI. Les secrets vivent dans le gestionnaire de secrets de l'environnement, jamais dans `.env` versionné.

**R9 — Toute migration de base est réversible.**
Chaque migration fournit son `up` et son `down`, et est testée sur une copie de la base de recette avant toute application en production.

**R10 — Aucune donnée personnelle réelle hors production.** [BLOQUANT]
Les environnements de développement et de recette utilisent exclusivement des jeux de données synthétiques ou anonymisés. Point critique : la base contient des données de **mineurs**.

**R11 — Journalisation immuable des actions sensibles.**
Création de compte, validation KYC, certification de performance, changement de rôle, accès à un dossier de mineur, opération de facturation : tout est tracé dans un journal d'audit inaltérable.

**R12 — Aucune dépendance non auditée.**
Toute nouvelle dépendance passe par : licence vérifiée, audit de vulnérabilités, poids évalué, alternative native envisagée. Consignée dans `DEPENDENCIES.md`.

**R13 — Feature flags par défaut.**
Toute fonctionnalité non triviale est livrée derrière un drapeau, désactivé en production jusqu'à validation métier. Cela permet de merger tôt sans exposer.

**R14 — Revue croisée obligatoire.** [BLOQUANT]
Personne ne merge son propre code. Chaque PR est relue par l'autre intervenant, avec commentaire explicite d'approbation portant sur : sécurité, tests, performance, lisibilité.

### 1.1 Definition of Ready (avant de commencer un lot)

- [ ] Le périmètre fonctionnel est écrit et validé par le porteur produit
- [ ] Les dépendances amont sont mergées en `develop`
- [ ] Le contrat d'API (schéma d'entrée/sortie) est rédigé et approuvé
- [ ] Le modèle de données impacté est identifié, migration esquissée
- [ ] Les cas d'erreur et les cas limites sont listés
- [ ] Les critères d'acceptation sont écrits, testables et chiffrés

### 1.2 Definition of Done (pour clôturer un lot) [DoD]

- [ ] Code mergé dans `develop` via PR approuvée
- [ ] Tests unitaires + intégration écrits, verts, seuils de couverture atteints
- [ ] Test end-to-end du parcours principal (Playwright) vert
- [ ] Schéma OpenAPI à jour, exemples fournis
- [ ] Migration testée en `up` et en `down`
- [ ] Aucune vulnérabilité critique ou haute (`npm audit`, Trivy)
- [ ] Journalisation et gestion d'erreurs en place
- [ ] Contrôles d'accès (RBAC) vérifiés par un test dédié « rôle non autorisé »
- [ ] Déployé et fumé (smoke-tested) en recette
- [ ] Entrée ajoutée au `CHANGELOG.md`
- [ ] Documentation utilisateur ou back-office mise à jour si le lot est visible

---

## 2. Organisation du travail à deux

### 2.1 Principe de répartition

Le projet est découpé en **couches horizontales** et en **modules verticaux**. Pour éviter les conflits et les blocages, la règle est :

> **Un module vertical appartient à une seule personne du début à la fin.** Les couches transverses (socle, sécurité, CI) sont co-détenues avec un propriétaire désigné par domaine.

### 2.2 Grille de répartition indicative

| Domaine | Propriétaire principal | Relecteur |
|---|---|---|
| Infrastructure, CI/CD, environnements, secrets | Dev A | Dev B |
| Schéma de base de données, migrations, RLS | Dev A | Dev B |
| Authentification, sessions, RBAC | Dev A | Dev B |
| KYC, vérification, anti-fraude | Dev A | Dev B |
| Design system, shell applicatif, composants | Dev B | Dev A |
| Onboarding joueur / organisation, formulaires | Dev B | Dev A |
| Module OZ Performance, saisie et certification | Dev B | Dev A |
| Recherche, filtres, exports | Dev B | Dev A |
| Back-office d'administration | Dev A | Dev B |
| Abonnements, paiements, facturation | Dev A | Dev B |
| Notifications, emails, SMS | Dev B | Dev A |
| Observabilité, alertes, runbooks | Dev A | Dev B |

L'affectation nominative A/B est arrêtée au démarrage selon les forces de chacun ; la **structure** de la répartition, elle, ne change pas.

### 2.3 Stratégie Git imposée [BLOQUANT]

**Branches permanentes**

| Branche | Rôle | Protection |
|---|---|---|
| `main` | Production. Reflète exactement ce qui tourne. | Merge par PR uniquement, depuis `release/*` ou `hotfix/*`. 1 approbation. CI verte. |
| `develop` | Intégration continue. Base de toutes les branches de travail. | Merge par PR uniquement. 1 approbation. CI verte. |

**Branches éphémères**

```
feat/<phase>-<module>-<description-courte>     ex. feat/p1-auth-refresh-token-rotation
fix/<ticket>-<description>                     ex. fix/OZ-142-upload-mime-check
chore/<description>                            ex. chore/upgrade-prisma-6
refactor/<module>-<description>
test/<module>-<description>
release/<version>                              ex. release/1.2.0
hotfix/<version>                               ex. hotfix/1.2.1
```

**Convention de commits** — Conventional Commits, vérifiée par `commitlint` :

```
feat(auth): ajout de la rotation des refresh tokens
fix(kyc): rejet des documents dont le MIME ne correspond pas à l'extension
chore(deps): montée de Prisma en 6.2.0
docs(api): exemples de réponse pour /players/search
BREAKING CHANGE: le champ `birthDate` devient obligatoire
```

**Cycle de vie d'une branche** — la règle « pousser les branches une par une » :

1. `git checkout develop && git pull --rebase`
2. Créer la branche du module
3. Développer par petits commits atomiques, pousser quotidiennement (branche distante = sauvegarde)
4. Ouvrir la PR en **brouillon** dès le premier push (visibilité de l'avancement)
5. Passer la PR en « prête » quand la [DoD] est satisfaite
6. Revue croisée → corrections → approbation
7. **Squash merge** dans `develop`, suppression de la branche
8. Déploiement automatique en recette, fumage
9. Le module suivant démarre

**Interdits absolus** : commit direct sur `main` ou `develop` · force push sur branche partagée · merge d'une PR sans revue · branche vivant plus de 5 jours ouvrés sans rebase sur `develop`.

### 2.4 Cadence et rituels

| Rituel | Fréquence | Durée | Objet |
|---|---|---|---|
| Point de synchronisation | Quotidien | 15 min | Fait / en cours / bloqué |
| Revue de lot | À chaque fin de lot | 30 min | Démonstration en recette, validation [DoD] |
| Revue de phase | Fin de phase | 90 min | Démonstration complète, validation [JALON], décision d'ouverture de la phase suivante |
| Revue technique | Bimensuel | 60 min | Dette, dépendances, performance, sécurité, ADR en attente |
| Rétrospective | Fin de phase | 45 min | Ce qui a marché, ce qui bloque, ajustements de méthode |

### 2.5 Gestion des tickets

Un outil unique (GitHub Projects ou Linear), avec :
- Un ticket par lot, portant l'identifiant `OZ-<numéro>`
- États : `Backlog → Ready → In Progress → In Review → In Staging → Done`
- Chaque PR référence son ticket ; chaque ticket référence sa PR
- Aucun travail hors ticket

---

## 3. Architecture cible

### 3.1 Le modèle « Uber du football » et ses conséquences techniques

OZ est une **place de marché à deux faces** : d'un côté l'offre de talent (joueurs, académies, clubs), de l'autre la demande (recruteurs, clubs, fédérations), avec un tiers de confiance (Centres OZ Performance) qui certifie la donnée échangée. C'est exactement la topologie d'Uber : offre, demande, appariement, confiance, transaction.

Cette analogie impose cinq contraintes structurantes dès le premier jour :

| Contrainte | Traduction technique |
|---|---|
| **Effet de réseau** — la valeur croît avec le volume | Base conçue pour des millions de profils : indexation, pagination par curseur, pas de `COUNT(*)` naïf, pas de `SELECT *` |
| **Appariement** — trouver le bon profil en secondes | Moteur de recherche multicritère dédié, dénormalisation contrôlée, cache de résultats |
| **Confiance** — la donnée doit être crue | Chaîne de vérification traçable, empreintes cryptographiques, journal d'audit inaltérable |
| **Expansion géographique** — Cameroun → Afrique → monde | Multi-pays et multi-langue dès le schéma : pas de champ « région » codé en dur, i18n structurelle, fuseaux horaires en UTC |
| **Pics d'usage** — détections, tournois, sélections | Application sans état, montée en charge horizontale, traitements lourds en file d'attente |

### 3.2 Schéma d'ensemble

```
                          ┌───────────────────────────────┐
                          │   Cloudflare (DNS, CDN, WAF,  │
                          │   rate limit, bot management)  │
                          └───────────────┬───────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                 │
┌───────▼────────┐              ┌─────────▼─────────┐             ┌─────────▼─────────┐
│  Web public    │              │  Web organisation │             │  Back-office OZ   │
│  + inscription │              │  (tableaux bord)  │             │  (administration) │
│  Next.js       │              │  Next.js          │             │  Next.js          │
└───────┬────────┘              └─────────┬─────────┘             └─────────┬─────────┘
        │                                 │                                 │
        └─────────────────────────────────┼─────────────────────────────────┘
                                          │  HTTPS / JSON / OpenAPI
                          ┌───────────────▼───────────────┐
                          │        API OZ (NestJS)         │
                          │  Auth · RBAC · Validation      │
                          │  Modules métier isolés         │
                          └───┬───────┬───────┬───────┬────┘
                              │       │       │       │
              ┌───────────────┘       │       │       └───────────────┐
              │                       │       │                       │
     ┌────────▼────────┐   ┌──────────▼──┐ ┌──▼──────────┐  ┌─────────▼────────┐
     │  PostgreSQL 16  │   │  Redis      │ │  Stockage   │  │  Workers BullMQ  │
     │  (données,      │   │  (cache,    │ │  objets S3  │  │  (KYC, imports,  │
     │   RLS, audit)   │   │   sessions, │ │  (documents,│  │   emails, PDF,   │
     │                 │   │   files)    │ │   vidéos)   │  │   antivirus)     │
     └─────────────────┘   └─────────────┘ └─────────────┘  └──────────────────┘
              │
     ┌────────▼──────────────────────────────────────────────────────────────┐
     │  Services externes : Stripe · Mobile Money (CinetPay/Flutterwave)     │
     │  Resend (email) · Twilio (SMS/OTP) · Sentry · ClamAV · Meilisearch    │
     └───────────────────────────────────────────────────────────────────────┘
```

### 3.3 Monorepo — arborescence imposée

```
oz/
├─ apps/
│  ├─ web/                 # Next.js — surface publique + espaces entités
│  ├─ admin/               # Next.js — back-office interne OZ
│  ├─ api/                 # NestJS — API REST + OpenAPI
│  └─ worker/              # NestJS standalone — consommateurs BullMQ
├─ packages/
│  ├─ contracts/           # Schémas Zod partagés client/serveur  ← PIVOT
│  ├─ db/                  # Prisma schema, migrations, seeds
│  ├─ ui/                  # Design system, composants, tokens
│  ├─ core/                # Logique métier pure (OZ ID, scoring, règles d'âge)
│  ├─ auth/                # Primitives d'authentification et de rôles
│  ├─ config/              # Config typée, chargement d'environnement
│  └─ testing/             # Fixtures, factories, helpers de test
├─ infra/
│  ├─ docker/              # Dockerfiles, compose de développement
│  ├─ terraform/           # Infrastructure as Code
│  └─ scripts/             # Sauvegarde, restauration, maintenance
├─ docs/
│  ├─ adr/                 # Architecture Decision Records
│  ├─ runbooks/            # Procédures d'exploitation
│  ├─ api/                 # OpenAPI généré
│  └─ security/            # Politique, analyse de risques, registre RGPD
└─ .github/workflows/      # CI/CD
```

**`packages/contracts` est le pivot de tout le système.** Il contient les schémas de validation Zod, importés simultanément par le formulaire React et par le contrôleur NestJS. Un seul schéma, deux exécutions : c'est le fondement mécanique de la double vérification client/serveur (chapitre 7). Aucun champ ne peut exister côté client sans exister dans `contracts`.

### 3.4 Découpage en modules (bounded contexts)

Chaque module est un dossier autonome dans `apps/api/src/modules/`, avec son contrôleur, son service, son repository, ses schémas, ses tests. Les modules ne s'appellent pas directement : ils communiquent par interfaces publiques ou par événements.

| Module | Responsabilité | Phase |
|---|---|---|
| `identity` | Comptes, sessions, mots de passe, rôles, tokens | 1 |
| `player` | OZ ID, fiche joueur, caractéristiques sportives | 1 |
| `organization` | Académies, clubs, fédérations, centres, recruteurs | 1 |
| `kyc` | Dossiers de vérification, statuts, décisions | 1 |
| `document` | Téléversement, antivirus, signature, URL signées | 1 |
| `import` | Chargement en masse, mise en correspondance, rapports | 1 |
| `search` | Recherche multicritère, filtres, tri, exports | 1 |
| `notification` | Email, SMS, notifications applicatives | 1 |
| `audit` | Journal immuable des actions sensibles | 1 |
| `performance` | Tests physiques, sessions, certification | 2 |
| `roster` | Effectifs, affectations, mouvements | 2 |
| `history` | Mémoire de carrière, événements de parcours | 2 |
| `analytics` | Statistiques, agrégats, tableaux de bord | 2 |
| `billing` | Abonnements, paliers, paiements, factures | 2 |
| `intelligence` | Comparaison, détection de potentiel, rapports | 3 |
| `media` | Vidéos, transcodage, extraits | 4 |
| `messaging` | Messagerie interne, fils de discussion | 4 |
| `marketplace` | Place de marché de services | 5 |

### 3.5 Multi-tenant et cloisonnement

OZ n'est pas multi-tenant au sens SaaS classique (une base par client). C'est une **base unique partagée avec cloisonnement logique**, parce que la valeur vient précisément du fait que tout le monde voit la même donnée de référence.

Le cloisonnement s'exerce donc à trois niveaux, cumulés :

1. **Row Level Security PostgreSQL** — filtrage au niveau de la base, dernier rempart si la couche applicative est contournée.
2. **Politiques applicatives (CASL)** — un objet de règles par rôle, évalué à chaque requête, testé unitairement.
3. **Sérialisation par vue** — un même enregistrement produit des DTO différents selon le rôle du demandeur. Un recruteur non abonné ne reçoit **jamais** le champ `phone` du joueur : il n'est pas masqué à l'affichage, il n'est pas envoyé.

> Règle de conception : on ne masque jamais une donnée côté client. On ne l'envoie pas.

### 3.6 Scalabilité — décisions prises maintenant, bénéfices plus tard

| Décision | Prise dès la Phase 1 | Pourquoi |
|---|---|---|
| API sans état, session en Redis | Oui | Permet de passer de 1 à N instances sans réécriture |
| Pagination par curseur, jamais par `OFFSET` | Oui | `OFFSET 50000` s'effondre ; le curseur reste constant |
| Traitements > 500 ms en file d'attente | Oui | Imports, antivirus, PDF, emails, transcodage |
| Identifiants UUIDv7 | Oui | Triables par date, sans collision, sans révéler le volume |
| Colonnes de dénormalisation pour la recherche | Oui | `search_vector`, `age_years` calculé, index GIN |
| Table `audit_log` en partitionnement mensuel | Oui | Évite une table de plusieurs centaines de millions de lignes non gérable |
| Séparation lecture/écriture prête (réplicas) | Structure oui, activation Phase 3 | Le code passe par un `DatabaseService` qui saura router |
| CDN devant les médias | Oui | Contexte de connexion africain : c'est une exigence, pas un confort |

---

## 4. Stack technique complète

### 4.1 Principes de sélection

Quatre critères, dans cet ordre : **maturité** (pas de technologie sans écosystème établi) · **cohérence** (TypeScript de bout en bout, un seul langage, un seul modèle mental) · **réversibilité** (aucun verrouillage fournisseur irréversible) · **coût d'exploitation** (le projet doit tenir avant les premiers revenus).

### 4.2 Tableau de stack

| Couche | Choix | Version cible | Justification |
|---|---|---|---|
| **Langage** | TypeScript (mode `strict`) | 5.7+ | Un seul langage front/back/scripts. Contrats partagés compilés. |
| **Gestionnaire de paquets** | pnpm + workspaces | 9+ | Rapide, strict sur les dépendances fantômes, adapté au monorepo. |
| **Orchestration monorepo** | Turborepo | 2+ | Cache de build, tâches parallèles, CI accélérée. |
| **Frontend** | Next.js (App Router) | 15 | Rendu serveur pour le SEO des profils publics, routes API, streaming, excellent sur connexion faible. |
| **UI** | Tailwind CSS + shadcn/ui + Radix | — | Design system possédé (pas de dépendance à une bibliothèque tierce), accessibilité native Radix. |
| **État serveur** | TanStack Query | 5 | Cache, invalidation, retry, mode hors-ligne partiel. |
| **État client** | Zustand | 5 | Minimal, sans boilerplate. Réservé au strict nécessaire. |
| **Formulaires** | React Hook Form + Zod resolver | — | Performance sur formulaires longs (onboarding joueur), validation partagée. |
| **Tableaux/données** | TanStack Table | 8 | Effectifs, résultats de recherche, back-office. |
| **Graphiques** | Recharts | — | Courbes de progression, tableaux de bord. |
| **Backend** | NestJS | 11 | Modularité imposée par le framework — c'est exactement ce dont un projet à deux développeurs travaillant en parallèle a besoin. Injection de dépendances, testabilité, OpenAPI natif. |
| **Runtime** | Node.js LTS | 22 | Support long terme. |
| **Validation** | Zod | 3.24+ | Schéma unique client/serveur. **Pierre angulaire de la règle R4.** |
| **ORM** | Prisma | 6 | Migrations versionnées et réversibles, typage généré, lisibilité du schéma. |
| **Base de données** | PostgreSQL | 16 | Relationnel strict pour des données d'identité. RLS natif. FTS + `pg_trgm` + `unaccent` pour la recherche Phase 1. `pgcrypto` pour le chiffrement colonne. |
| **Cache / files** | Redis + BullMQ | 7 / 5 | Sessions, rate limiting, verrous, files de traitement asynchrone. |
| **Stockage objets** | S3-compatible (Cloudflare R2 ou Scaleway) | — | Documents d'identité, photos, vidéos. Accès exclusivement par URL signées à courte durée. |
| **Recherche avancée** | PostgreSQL FTS (Ph. 1-2) → Meilisearch (Ph. 3) | — | On ne complexifie pas avant d'en avoir besoin. Seuil de bascule : > 200 000 profils ou latence p95 > 300 ms. |
| **Authentification** | Implémentation propriétaire NestJS (Argon2id, JWT + rotation de refresh) | — | L'auth est le cœur de la valeur (identité vérifiée) : elle ne se sous-traite pas. Passeport social possible plus tard. |
| **2FA** | TOTP (`otplib`) — obligatoire admins et centres | — | Comptes à pouvoir de certification. |
| **Anti-bot** | Google reCAPTCHA v3 + honeypot + limitation de débit | — | Inscriptions massives frauduleuses = risque n°1 sur une plateforme freemium. |
| **Paiements internationaux** | Stripe | — | Abonnements, portail client, webhooks, factures. |
| **Paiements Afrique** | CinetPay ou Flutterwave (MTN MoMo, Orange Money) | — | **[BLOQUANT]** Sans mobile money, le marché camerounais ne peut pas payer. Interface `PaymentProvider` abstraite dès le départ. |
| **Email transactionnel** | Resend (ou Postmark) + React Email | — | Gabarits en composants React, délivrabilité, webhooks de suivi. |
| **SMS / OTP** | Twilio ou agrégateur local | — | Vérification de numéro, canal privilégié en Afrique. |
| **Antivirus** | ClamAV (conteneur dédié) | — | Tout fichier téléversé est scanné avant d'être rendu accessible. |
| **Conteneurisation** | Docker + Docker Compose | — | Parité stricte développement / recette / production. |
| **Hébergement** | VPS Hetzner ou OVH + Coolify (Ph. 1-2) → Azure Container Apps ou Scaleway (Ph. 3+) | — | Coût maîtrisé au démarrage, chemin de migration connu. Région de données : Europe, avec étude d'une région africaine à l'expansion (souveraineté de la donnée). |
| **Reverse proxy** | Traefik ou Caddy | — | TLS automatique, routage par domaine. |
| **CDN / WAF / DNS** | Cloudflare | — | Cache des médias, protection DDoS, règles WAF, Turnstile en secours de reCAPTCHA. |
| **IaC** | Terraform | — | Infrastructure reproductible, revue par PR. |
| **CI/CD** | GitHub Actions | — | Intégré au dépôt, matrices de tests, environnements protégés. |
| **Erreurs** | Sentry | — | Front, API et workers. Traçage distribué. |
| **Logs / métriques** | Grafana + Loki + Prometheus (ou Better Stack) | — | Journaux structurés JSON, tableaux de bord, alertes. |
| **Disponibilité** | UptimeRobot / Better Stack | — | Sondes externes sur les parcours critiques. |
| **Tests unitaires** | Vitest | — | Rapide, compatible TypeScript natif. |
| **Tests API** | Supertest + Testcontainers | — | Base PostgreSQL réelle et jetable par suite de tests. |
| **Tests E2E** | Playwright | — | Parcours d'inscription, de KYC, de recherche. |
| **Tests de charge** | k6 | — | Avant chaque mise en production de phase. |
| **Qualité** | ESLint, Prettier, Husky, lint-staged, commitlint, gitleaks | — | Barrières automatiques, pas de discipline humaine seule. |
| **Analyse de sécurité** | Trivy, `npm audit`, Snyk (gratuit), CodeQL | — | En CI, bloquant sur criticité haute. |
| **Documentation composants** | Storybook | 8 | Le design system se valide visuellement, isolément. |
| **Documentation projet** | Markdown dans `docs/` + ADR | — | La documentation vit avec le code, versionnée. |

### 4.3 Décisions à consigner en ADR dès le sprint 0 [ADR]

1. `ADR-001` — NestJS plutôt que Fastify ou Express nu
2. `ADR-002` — Authentification propriétaire plutôt que fournisseur externe (Auth0, Supabase Auth, Clerk)
3. `ADR-003` — PostgreSQL managé versus auto-hébergé, et région de résidence des données
4. `ADR-004` — Zod comme contrat unique de validation
5. `ADR-005` — Stratégie de recherche progressive (FTS puis moteur dédié)
6. `ADR-006` — Abstraction des fournisseurs de paiement
7. `ADR-007` — UUIDv7 comme identifiant technique, OZ ID comme identifiant métier
8. `ADR-008` — Politique de conservation et de purge des documents d'identité

### 4.4 Ce qui est explicitement écarté et pourquoi

| Écarté | Raison |
|---|---|
| GraphQL | Surface d'attaque et complexité de contrôle d'accès par champ, sans bénéfice à ce stade. REST + OpenAPI suffit. |
| Microservices | Deux développeurs. Un monolithe modulaire bien découpé se découpe plus tard ; l'inverse est impossible. |
| MongoDB / NoSQL | Données d'identité fortement relationnelles, contraintes d'intégrité indispensables. |
| Blockchain pour la certification | Effet d'annonce. Un journal d'audit signé cryptographiquement (hash chaîné) apporte la même garantie de non-répudiation, sans le coût. |
| Backend-as-a-Service intégral | Verrouillage fournisseur sur le cœur de valeur (l'identité vérifiée). |

---

## 5. Modèle de données — socle Phase 1

### 5.1 Règles transverses appliquées à toutes les tables

- Clé primaire `id UUID` (UUIDv7), jamais d'entier séquentiel exposé
- `created_at`, `updated_at` en `timestamptz` UTC, `deleted_at` pour la suppression logique
- `created_by`, `updated_by` référençant `users.id` sur les tables sensibles
- Aucune suppression physique sur les données de personnes : anonymisation ou suppression logique
- Toute colonne contenant une donnée d'identité sensible est chiffrée au niveau colonne (`pgcrypto`)
- Row Level Security activée sur toutes les tables exposées à des rôles externes

### 5.2 Entités principales

```
users                     compte technique : email, hash Argon2id, statut, 2FA, dernier accès
├─ user_roles             rôle(s) et portée (organisation rattachée)
├─ sessions               refresh tokens, empreinte appareil, IP, révocation
└─ audit_log              journal immuable, hash chaîné

players                   fiche joueur
├─ oz_id                  identifiant métier unique, format normalisé, checksum
├─ identity               nom, prénom, date de naissance, nationalité, ville, pays
├─ sport_profile          poste principal/secondaire, pied fort, taille, poids
├─ verification_status    declared | pending | verified | rejected | suspended
├─ guardian_id            → tuteur légal si mineur  [BLOQUANT si âge < 18]
└─ visibility_settings    granularité de ce qui est public

organizations             académie | club | fédération | centre | recruteur
├─ type, pays, région, ville, statut de vérification
├─ subscription_id        → abonnement courant
└─ members                utilisateurs rattachés + rôle interne

guardians                 parent ou tuteur légal : identité, lien, consentement horodaté

kyc_cases                 dossier de vérification
├─ subject (player | organization)
├─ level                  0 à 3
├─ status                 draft | submitted | in_review | approved | rejected | expired
├─ checks[]               résultats des contrôles automatiques
├─ decision               décideur, motif, horodatage, second validateur
└─ documents[]            → documents

documents                 fichier téléversé
├─ type                   acte de naissance | pièce d'identité | photo | licence | vidéo
├─ storage_key, mime, taille, sha256
├─ av_status              pending | clean | infected | error
├─ ocr_extract            données extraites, jamais utilisées seules pour décider
└─ retention_until        date de purge automatique

imports                   opération de chargement en masse
├─ source, fichier d'origine, empreinte
├─ mapping                correspondance colonnes → champs
├─ rows_total / ok / rejected
└─ report_key             rapport détaillé téléchargeable

consents                  registre des consentements (RGPD / mineurs)
subscriptions             abonnement : palier, statut, période, fournisseur, quotas
notifications             file et historique des notifications émises
```

### 5.3 Format de l'OZ ID [BLOQUANT]

```
OZ-CM-26-7K4M9Q-3
│  │  │  │      └─ checksum (mod 37, détecte 100 % des erreurs à un caractère)
│  │  │  └──────── 6 caractères base32 Crockford (sans I, L, O, U — pas d'ambiguïté à l'oral ni à la saisie)
│  │  └─────────── année d'émission (2 chiffres)
│  └────────────── pays ISO 3166-1 alpha-2
└───────────────── préfixe fixe
```

Propriétés exigées : non séquentiel (ne révèle pas le nombre d'inscrits) · dictable au téléphone sans confusion · vérifiable hors ligne par checksum · immuable à vie · jamais réattribué, même après suppression d'un compte.

### 5.4 Machine à états de la vérification

```
        ┌──────────┐  soumission   ┌───────────┐  contrôles auto  ┌────────────┐
        │ DECLARED ├──────────────►│  PENDING  ├─────────────────►│ IN_REVIEW  │
        └──────────┘               └─────┬─────┘                  └──────┬─────┘
                                         │ rejet automatique             │
                                         │ (document illisible,          │ décision humaine
                                         │  antivirus, incohérence)      │ (double validation
                                         ▼                               │  si mineur ou
                                   ┌──────────┐                          │  incohérence)
                                   │ REJECTED │◄─────────────────────────┤
                                   └──────────┘                          ▼
                                                                 ┌──────────────┐
                                                                 │   VERIFIED   │
                                                                 └──────┬───────┘
                                                                        │ signalement / expiration
                                                                        ▼
                                                                 ┌──────────────┐
                                                                 │  SUSPENDED   │
                                                                 └──────────────┘
```

Règles : une transition n'est jamais implicite, elle est toujours écrite dans `audit_log` avec son acteur et son motif · un profil `VERIFIED` dont le document arrive à expiration repasse en `PENDING` (revérification périodique, 24 mois) · un profil `REJECTED` peut être resoumis, avec compteur de tentatives et limitation de débit.

---

## 6. Sécurité et conformité

### 6.1 Modèle de menaces — les huit risques réels de cette plateforme

| # | Menace | Impact | Contre-mesure principale |
|---|---|---|---|
| 1 | **Fraude à l'âge et à l'identité** — le mal que la plateforme est censée guérir | Destruction de la crédibilité, donc du produit | Chapitre 7 : KYC multi-niveaux, double vérification, détection de doublons biométriques légers, quatre yeux sur les mineurs |
| 2 | **Fuite de données de mineurs** | Sanction réglementaire + risque humain grave + fin du projet | Chiffrement, cloisonnement, minimisation, consentement tuteur, journalisation des accès, purge |
| 3 | **Comptes recruteurs frauduleux** — usurpation pour approcher des jeunes | Risque de traite et de fausses promesses — le fléau que le document projet dénonce | Vérification renforcée obligatoire des comptes recruteurs, mise en relation tracée, jamais de contact direct non journalisé avec un mineur |
| 4 | **Certification frauduleuse de performances** | Perte de la valeur du badge « certifié » | Comptes centres à 2FA obligatoire, empreinte de la preuve, contrôle statistique des valeurs aberrantes, révocabilité |
| 5 | **Inscription massive automatisée** | Pollution de la base, coûts, dévaluation | reCAPTCHA v3 + limitation de débit + vérification email et SMS + score de risque |
| 6 | **Escalade de privilèges** | Accès total à la base d'identité | RBAC testé, RLS, tests automatiques « rôle non autorisé » sur chaque endpoint |
| 7 | **Téléversement malveillant** | Compromission serveur, distribution de malware | Antivirus, vérification MIME réelle, ré-encodage des images, stockage hors du domaine applicatif, URL signées |
| 8 | **Aspiration de la base par un concurrent** | Perte de l'avantage du premier entrant | Quotas par abonnement, limitation de débit, détection de comportement d'aspiration, filigrane des exports |

### 6.2 Authentification

- **Mots de passe** : Argon2id (m=19456, t=2, p=1), minimum 12 caractères, vérification contre la base HaveIBeenPwned par k-anonymité, jamais de règle de composition arbitraire
- **Jetons** : accès JWT courte durée (15 min) en mémoire ; rafraîchissement en cookie `httpOnly` + `Secure` + `SameSite=Strict`, **rotation à chaque usage avec détection de réutilisation** (une réutilisation = révocation de toute la famille de jetons)
- **Sessions** : listées et révocables par l'utilisateur, avec appareil, IP tronquée, date
- **2FA TOTP** : obligatoire pour administrateurs OZ, centres de performance et comptes fédération ; optionnel ailleurs
- **Verrouillage progressif** : délai exponentiel après échecs, jamais de verrouillage définitif (déni de service par blocage de compte)
- **Vérification email obligatoire** avant toute action ; vérification SMS obligatoire avant soumission KYC

### 6.3 Autorisation

Trois couches cumulatives, déjà décrites au §3.5. Exigence de test : **chaque endpoint dispose d'un test automatisé qui vérifie qu'un rôle non autorisé reçoit 403 et non 200 avec données filtrées.** Une PR ajoutant un endpoint sans ce test est refusée. [BLOQUANT]

### 6.4 Couverture OWASP Top 10 — mesures concrètes

| Risque | Mesure appliquée dans OZ |
|---|---|
| A01 Contrôle d'accès défaillant | RBAC + RLS + tests de rôle systématiques + refus par défaut |
| A02 Défaillances cryptographiques | TLS 1.3 partout, HSTS, chiffrement colonne des données d'identité, secrets en coffre |
| A03 Injection | Prisma paramétré exclusivement, aucune requête SQL concaténée, validation Zod stricte, échappement React |
| A04 Conception non sécurisée | Ce document ; modèle de menaces ; revue de sécurité par phase |
| A05 Mauvaise configuration | Images Docker minimales et non-root, en-têtes de sécurité, CSP stricte, CORS liste blanche, pas de `debug` en production |
| A06 Composants vulnérables | Dependabot, Trivy, `npm audit` bloquants en CI |
| A07 Identification défaillante | Argon2id, rotation de jetons, 2FA, détection de réutilisation |
| A08 Intégrité logicielle/données | `pnpm-lock` figé, CI signée, hash chaîné du journal d'audit |
| A09 Journalisation insuffisante | Logs JSON structurés, corrélation par `requestId`, alertes Sentry, conservation 12 mois |
| A10 SSRF | Aucune récupération d'URL fournie par l'utilisateur sans liste blanche |

### 6.5 En-têtes et politique de contenu

```
Content-Security-Policy: default-src 'self'; img-src 'self' https://<cdn> data:;
  script-src 'self' 'nonce-<aléatoire>' https://www.google.com/recaptcha/;
  frame-ancestors 'none'; object-src 'none'; base-uri 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=()
```

### 6.6 Limitation de débit (valeurs de départ, à ajuster sous observation)

| Endpoint | Limite |
|---|---|
| `POST /auth/login` | 5 / 15 min / IP + 10 / heure / compte |
| `POST /auth/register` | 3 / heure / IP, 1 / email |
| `POST /kyc/submit` | 3 / jour / utilisateur |
| `GET /search` | 60 / min authentifié, quota journalier selon palier d'abonnement |
| `POST /documents/upload` | 20 / heure / utilisateur, 50 Mo par fichier |
| Global API | 1000 / min / IP (Cloudflare) |

### 6.7 Protection des mineurs [BLOQUANT]

C'est le point où une erreur ne se rattrape pas. Règles inconditionnelles :

1. **Détection automatique de minorité** à partir de la date de naissance, à chaque requête, jamais mise en cache dans le jeton.
2. **Aucun profil de mineur n'est indexé publiquement.** Pas d'accès anonyme, pas de référencement moteur, `noindex` forcé.
3. **Consentement du tuteur légal horodaté et documenté** avant toute publication du profil. Tuteur non vérifié = profil non publiable.
4. **Coordonnées directes d'un mineur jamais exposées**, à aucun rôle, à aucun palier. Le contact passe obligatoirement par l'organisation de rattachement ou le tuteur.
5. **Toute consultation d'un profil de mineur par un recruteur est journalisée**, avec identité du consultant, et visible par le tuteur.
6. **Recruteur non vérifié = aucun accès aux profils de mineurs**, quel que soit l'abonnement.
7. **Minimisation** : on ne collecte que ce qui sert la finalité déclarée. Pas de données de santé, pas de données scolaires, pas de géolocalisation précise.
8. **Bouton de signalement** présent sur chaque profil et chaque échange, avec traitement sous 48 h.

### 6.8 Cadre réglementaire applicable

| Cadre | Portée | Implication technique |
|---|---|---|
| Loi camerounaise n° 2010/012 (cybersécurité et cybercriminalité) | Cameroun | Sécurisation, conservation de traces, coopération |
| Cadre camerounais de protection des données personnelles | Cameroun | Finalité, consentement, droits des personnes, notification d'incident |
| RGPD (UE) | Recruteurs et clubs européens = destinataires de données | Base légale, registre de traitement, DPA, transferts encadrés, droits d'accès/effacement/portabilité |
| Loi 25 (Québec) | Entité EXISTE au Québec | Évaluation des facteurs relatifs à la vie privée, responsable de la protection des renseignements |
| FIFA — protection des mineurs (art. 19 RSTJ) | Transferts internationaux de mineurs | Traçabilité irréprochable du parcours, refus de faciliter tout contournement |

**Livrables de conformité obligatoires en Phase 1 :** registre des traitements · politique de confidentialité et CGU rédigées avant l'ouverture des inscriptions **[BLOQUANT]** · formulaire de consentement tuteur · procédure d'exercice des droits · procédure de notification d'incident sous 72 h · accords de sous-traitance avec chaque prestataire (hébergeur, email, paiement).

### 6.9 Chiffrement, secrets, sauvegardes

- **En transit** : TLS 1.3, certificats automatiques, HSTS preload
- **Au repos** : chiffrement disque au niveau hébergeur + chiffrement colonne `pgcrypto` sur les champs d'identité (numéro de document, données du tuteur)
- **Documents** : chiffrés côté serveur, accès uniquement par URL signée valable 5 minutes, jamais d'URL publique permanente
- **Secrets** : gestionnaire de l'hébergeur ou Infisical ; rotation trimestrielle ; aucun secret partagé par messagerie
- **Sauvegardes** : PostgreSQL — snapshot quotidien + WAL en continu, rétention 30 jours ; stockage objets — versioning + réplication ; **restauration testée mensuellement, procédure consignée en runbook** [BLOQUANT]
- **RTO 4 h / RPO 15 min** en Phase 1, à durcir en Phase 3

---

## 7. KYC et double vérification client / serveur

Ce chapitre est le cœur différenciant du produit. La valeur d'OZ, telle qu'énoncée dans le Document de Projet, tient au badge « profil vérifié ». Si ce badge peut être obtenu frauduleusement, le produit ne vaut rien. Ce qui suit décrit le dispositif complet.

### 7.1 Le principe de double vérification

> **Le client valide pour guider. Le serveur valide pour décider. Le serveur ne fait jamais confiance au client — jamais, sur rien.**

Mécaniquement, cela repose sur `packages/contracts` : un schéma Zod unique par ressource, importé des deux côtés.

```
packages/contracts/src/player/register.schema.ts
        │
        ├──► apps/web  : useForm({ resolver: zodResolver(registerSchema) })
        │               → retour immédiat, messages en français, UX fluide
        │
        └──► apps/api  : @UsePipes(new ZodValidationPipe(registerSchema))
                        → rejet 422 si non conforme, AVANT toute logique métier
```

Un champ ajouté au formulaire sans être ajouté au schéma ne parvient jamais au serveur : le pipe le supprime (`strict()`). Un champ ajouté au schéma sans être ajouté au formulaire fait échouer les tests de contrat. Le couplage est volontaire et vérifié.

### 7.2 Les quatre couches de validation

| Couche | Où | Rôle | Peut être contournée ? |
|---|---|---|---|
| **C1 — Ergonomique** | Navigateur, à la frappe | Guider, prévenir, formater | Oui, trivialement |
| **C2 — Contractuelle** | Pipe de validation API | Forme, types, bornes, énumérations | Non |
| **C3 — Métier** | Service de domaine | Cohérence : âge vs catégorie, unicité, quotas d'abonnement, règles de rôle | Non |
| **C4 — Intégrité** | Base de données | Contraintes `UNIQUE`, `CHECK`, clés étrangères, RLS | Non — dernier rempart |

**Exemple concret — date de naissance d'un joueur :**

- C1 : sélecteur de date bornant visuellement entre 6 et 45 ans, message immédiat
- C2 : `z.coerce.date().min(1980-01-01).max(aujourd'hui - 6 ans)` — rejet 422
- C3 : cohérence avec le document d'identité extrait par OCR ; si écart > 0, le dossier n'est **pas** rejeté automatiquement mais **escaladé en revue humaine avec l'écart signalé** ; si le joueur est mineur, exigence d'un tuteur vérifié
- C4 : `CHECK (birth_date <= CURRENT_DATE - INTERVAL '6 years')`

### 7.3 Les niveaux de KYC

| Niveau | Ce qui est vérifié | Ce que cela débloque | Badge |
|---|---|---|---|
| **KYC 0 — Déclaré** | Rien. Email confirmé uniquement. | Créer un profil, le compléter, le consulter soi-même | Aucun |
| **KYC 1 — Contact vérifié** | Email + téléphone (OTP SMS) | Profil visible des organisations, soumission de tests | « Contact vérifié » |
| **KYC 2 — Identité vérifiée** | Document officiel + selfie avec détection de vivacité + concordance faciale + contrôle de doublon + revue humaine | **Profil vérifié** — visible en recherche filtrée, apparaît aux recruteurs | ✅ **Profil vérifié** |
| **KYC 3 — Identité renforcée** | KYC 2 + acte de naissance + confirmation par la fédération ou le club, ou attestation d'un tiers reconnu | Éligibilité aux sélections, dossiers de transfert international | 🛡️ **Vérifié+** |

**Correspondance par rôle :**

| Rôle | Niveau minimum exigé |
|---|---|
| Joueur majeur | KYC 2 pour être visible |
| Joueur mineur | KYC 2 + tuteur vérifié en KYC 2 **[BLOQUANT]** |
| Académie / Club | KYC 2 organisationnel (registre, statuts, dirigeant) |
| Centre OZ Performance | KYC 3 + convention signée + 2FA obligatoire |
| Recruteur / Scout | **KYC 3 obligatoire** — licence ou mandat du club vérifié. Aucun accès aux mineurs sans cela. |
| Fédération | KYC 3 + convention institutionnelle |
| Administrateur OZ | KYC interne + 2FA + poste enregistré |

### 7.4 Pipeline de vérification d'identité

```
1. SOUMISSION (client)
   Compression et redimensionnement de l'image, suppression des EXIF
   Vérification du type MIME réel côté client (magic bytes) — confort uniquement
   Envoi direct au stockage via URL signée (l'API ne transporte pas le binaire)

2. RÉCEPTION (serveur, synchrone, < 300 ms)
   Vérification de la signature de téléversement
   Vérification MIME réelle serveur — l'extension n'est jamais crue
   Contrôle de taille, de dimensions, de nombre de pages
   Calcul du SHA-256 → recherche d'un document identique déjà soumis ailleurs
   Statut : PENDING · rien n'est visible

3. TRAITEMENT ASYNCHRONE (file BullMQ)
   a. Antivirus ClamAV               → INFECTED = rejet immédiat + alerte sécurité
   b. Ré-encodage de l'image         → détruit toute charge utile embarquée
   c. Contrôle de qualité            → netteté, luminosité, cadrage → rejet motivé si illisible
   d. OCR                            → extraction nom, prénom, date de naissance, numéro, émetteur
   e. Concordance déclaratif ↔ OCR   → distance de Levenshtein normalisée, tolérance accents/ordre
   f. Détection de falsification     → cohérence des polices, artefacts de compression, copier-coller
   g. Vivacité du selfie             → détection de présentation d'écran ou de photo imprimée
   h. Concordance faciale            → selfie ↔ photo du document, seuil de similarité
   i. Détection de doublon           → empreinte perceptuelle du visage vs base existante
   j. Score de risque                → agrégation pondérée 0-100

4. AIGUILLAGE
   Score < 25  et aucun signal fort  → APPROBATION AUTOMATIQUE possible (majeurs uniquement)
   Score 25-70 ou mineur             → REVUE HUMAINE OBLIGATOIRE
   Score > 70  ou signal fort        → REJET AUTOMATIQUE avec motif
   Mineur, recruteur, centre         → REVUE HUMAINE SYSTÉMATIQUE, quel que soit le score

5. DÉCISION HUMAINE (back-office)
   Interface de revue : document, selfie, déclaratif, écarts surlignés, historique
   Décision motivée obligatoire, choisie dans une liste normalisée
   ► RÈGLE DES QUATRE YEUX : pour un mineur, un recruteur ou un centre,
     deux administrateurs distincts doivent approuver.  [BLOQUANT]
   Écriture dans audit_log avec hash chaîné

6. APRÈS DÉCISION
   Approuvé → badge attribué, notification, purge programmée du document brut
              (le document d'identité n'est PAS conservé indéfiniment : seules
               la décision, l'empreinte et les métadonnées le sont)
   Rejeté   → motif communiqué, possibilité de resoumission, compteur incrémenté
              3 rejets → blocage 30 jours + revue manuelle obligatoire
```

**Point de conception fort :** OZ conserve la **preuve de la vérification**, pas nécessairement le document. Cela réduit massivement la surface de risque en cas de fuite tout en préservant la valeur du badge.

### 7.5 Double vérification des performances

Le Document de Projet prévoit deux sources de tests. Voici comment chacune est traitée.

**Source A — mesure en Centre OZ Performance (certifiée à la source)**

1. L'évaluateur s'authentifie avec 2FA sur un compte centre vérifié KYC 3
2. Il ouvre une session de test rattachée à un lieu et à une date
3. Chaque mesure est saisie avec l'OZ ID du joueur — scanné, pas tapé (QR du profil), pour empêcher l'erreur d'attribution
4. Contrôle de plausibilité immédiat : la valeur est comparée aux bornes physiologiques par catégorie d'âge, et à l'historique du joueur
5. Une variation aberrante (> 3 écarts-types, ou progression physiologiquement impossible) **ne bloque pas la saisie** mais déclenche un marquage `À CONFIRMER` et une revue OZ
6. À la clôture de session, l'évaluateur signe : hash de l'ensemble des mesures + identifiant évaluateur + horodatage serveur (jamais l'heure du client)
7. Statut : `CERTIFIÉ`

**Source B — test réalisé ailleurs, soumis par le joueur**

1. Soumission du résultat + preuve (procès-verbal du centre, et/ou vidéo)
2. Statut initial : `SOUMIS — NON CERTIFIÉ`, affiché comme tel, jamais confondu visuellement avec un résultat certifié
3. Contrôles automatiques : cohérence des métadonnées de la vidéo, absence de montage grossier, cohérence chronométrique quand mesurable, empreinte de la vidéo contre les vidéos déjà soumises (réutilisation)
4. Revue humaine OZ ou délégation à un centre partenaire
5. Si validé : statut `CERTIFIÉ (SOUMIS)` — visuellement distinct de `CERTIFIÉ (CENTRE)`. La transparence sur l'origine de la preuve fait partie de la confiance.

**Contrôle statistique continu (Phase 3)** : détection des centres dont la distribution des résultats dérive anormalement de la moyenne nationale. Un centre qui certifie systématiquement des valeurs élevées est audité. C'est ainsi qu'on protège la valeur du badge dans la durée.

### 7.6 Anti-fraude — arsenal

| Signal | Détection |
|---|---|
| Comptes multiples | Empreinte d'appareil, empreinte faciale perceptuelle, similarité de document, réseau d'inscriptions liées |
| Documents recyclés | Index SHA-256 + empreinte perceptuelle de tous les documents soumis |
| Vidéos réutilisées | Empreinte perceptuelle de séquences, détection d'images-clés identiques |
| Automatisation | reCAPTCHA v3, chronométrie de remplissage du formulaire (un humain ne remplit pas en 900 ms), champs pièges |
| Aspiration de la base | Analyse de la vélocité de consultation, quotas, filigrane individualisé des exports |
| Collusion centre/joueur | Analyse statistique des distributions par centre et par évaluateur |

Chaque signal alimente un **score de risque** consigné, jamais une décision automatique irrévocable sur un mineur.

### 7.7 Interdits explicites de conception [BLOQUANT]

- Ne jamais afficher une donnée comme « vérifiée » tant que la transition d'état n'est pas écrite en base et journalisée
- Ne jamais faire dépendre une décision d'autorisation d'une valeur transmise par le client (rôle, âge, niveau KYC, palier d'abonnement) : tout est relu en base à chaque requête
- Ne jamais utiliser l'horodatage du client pour une donnée faisant preuve
- Ne jamais permettre à un compte de modifier son propre niveau de KYC, son propre rôle, ou son propre statut de vérification
- Ne jamais renvoyer un message d'erreur qui révèle l'existence d'un compte (« email inconnu » versus « mot de passe incorrect » : même réponse)

---

## 8. Les phases du projet — découpage exact

### 8.0 Vue d'ensemble

| Phase | Nom | Livrable central | Jalon |
|---|---|---|---|
| **0** | Fondations | Socle technique, environnements, CI/CD, sécurité de base | J0 → J1 |
| **1** | Web & Inscriptions | Application web publique, inscription des 7 profils, KYC, chargement des données | **J2 — mise en production publique** |
| **2** | Gestion & Mémoire | Effectifs, OZ Performance complet, historique, statistiques, abonnements, mobile | J3 |
| **3** | Intelligence | Comparaison, détection de potentiel, rapports, moteur de recherche dédié | J4 |
| **4** | Relation & Preuve | Module vidéo, messagerie encadrée | J5 |
| **5** | Écosystème | OZ Legal, OZ Career, Marketplace, OZ Band | J6 |

---

### PHASE 0 — FONDATIONS

*Objectif : qu'aucune ligne de code métier ne soit écrite sur du sable.*

| Lot | Contenu | Propriétaire | Critère de sortie |
|---|---|---|---|
| **0.1** | Dépôt, monorepo pnpm + Turborepo, TypeScript strict, ESLint, Prettier, Husky, commitlint, gitleaks | Dev A | `pnpm install && pnpm build && pnpm lint && pnpm test` passe sur un poste vierge |
| **0.2** | Docker Compose de développement : PostgreSQL, Redis, MinIO, ClamAV, Mailpit | Dev A | Un seul `docker compose up` lève l'ensemble |
| **0.3** | Squelette NestJS : configuration typée, filtre d'exceptions global, format d'erreur normalisé, health check, Swagger | Dev A | `/health` et `/docs` répondent |
| **0.4** | Squelette Next.js : App Router, Tailwind, tokens de design, layout, i18n (fr par défaut, en préparé) | Dev B | Page d'accueil déployée en recette |
| **0.5** | `packages/contracts` : conventions, premier schéma, pipe de validation, tests de contrat | Dev A + B | Un schéma valide simultanément un formulaire et un endpoint |
| **0.6** | Prisma : schéma initial, première migration, seeds synthétiques, script d'anonymisation | Dev A | Migration `up` et `down` testées |
| **0.7** | CI GitHub Actions : lint, typecheck, test, build, audit, Trivy, couverture | Dev A | PR bloquée si un seul contrôle échoue |
| **0.8** | Environnements recette et production, domaines, TLS, Cloudflare, secrets | Dev A | Déploiement automatique de `develop` en recette |
| **0.9** | Observabilité : Sentry, logs structurés, `requestId`, sondes de disponibilité | Dev A | Une erreur provoquée remonte dans Sentry avec sa trace |
| **0.10** | Storybook + 8 composants de base (bouton, champ, sélecteur, carte, badge, tableau, modale, notification) | Dev B | Storybook déployé, composants documentés |
| **0.11** | Rédaction des ADR 001 à 008, `CONTRIBUTING.md`, `SECURITY.md`, modèle de PR | Dev A + B | Documents mergés |

**[JALON J1]** — Le socle est démontré : une modification poussée sur une branche déclenche la CI, produit une prévisualisation, et se déploie en recette après merge. Aucune ligne de code métier n'existe encore. C'est normal et c'est voulu.

---

### PHASE 1 — WEB PUBLIC, INSCRIPTIONS ET CHARGEMENT DES DONNÉES

*C'est la phase commandée. Elle se suffit à elle-même : à sa fin, OZ existe publiquement, les inscriptions sont ouvertes, les données des inscrits sont chargées, vérifiées et exploitables.*

#### Lot 1.1 — Modèle de données du socle · Dev A
Tables `users`, `user_roles`, `sessions`, `players`, `organizations`, `guardians`, `documents`, `kyc_cases`, `consents`, `audit_log`, `notifications`.
RLS activée sur chacune. Index de recherche préparés. Contraintes `CHECK` d'intégrité (âge, formats, énumérations).
**Sortie :** migration réversible testée, schéma documenté, diagramme entités-relations généré, seeds de 500 profils synthétiques.

#### Lot 1.2 — Générateur et registre OZ ID · Dev A
Génération, checksum, unicité garantie sous concurrence, réservation atomique, non-réattribution, QR code du profil.
**Sortie :** 1 000 000 d'identifiants générés en test sans collision ; validation hors ligne du checksum implémentée dans `packages/core` et testée à 100 %.

#### Lot 1.3 — Authentification et sessions · Dev A
Inscription, connexion, déconnexion globale, confirmation d'email, réinitialisation de mot de passe, rotation de refresh token avec détection de réutilisation, gestion des sessions actives, 2FA TOTP, reCAPTCHA v3, limitation de débit.
**Sortie :** couverture de tests 100 % sur le module ; scénario Playwright complet ; test de non-régression sur la réutilisation de jeton.

#### Lot 1.4 — Rôles, permissions et cloisonnement · Dev A
Sept rôles, matrice de droits implémentée en CASL, RLS PostgreSQL alignée, sérialisation par vue, décorateurs `@Roles` et `@Scope`.
**Sortie :** la matrice de l'Annexe B du Document de Projet est couverte par une suite de tests exhaustive : pour chaque couple (rôle, endpoint), le résultat attendu est vérifié. **[BLOQUANT]**

#### Lot 1.5 — Design system et coquille applicative · Dev B
Arbitrage de l'identité visuelle (le Document de Projet §12.2 laisse deux directions ouvertes : la décision est prise ici, une fois pour toutes, et consignée en ADR).
Tokens, thème sombre, typographie, grille, composants de formulaire, états de chargement et d'erreur, accessibilité AA, responsive à partir de 320 px.
**Sortie :** Storybook complet ; audit Lighthouse ≥ 90 en accessibilité et bonnes pratiques ; test sur connexion 3G simulée.

#### Lot 1.6 — Site public et pages d'atterrissage · Dev B
Accueil, présentation par profil (joueur, académie, club, fédération, centre, recruteur), tarifs, à propos, contact, mentions légales, politique de confidentialité, CGU.
Optimisation SEO, métadonnées sociales, sitemap, `robots.txt` interdisant l'indexation de tout profil.
**Sortie :** Lighthouse performance ≥ 85 sur mobile ; pages légales publiées **[BLOQUANT avant ouverture des inscriptions]**.

#### Lot 1.7 — Inscription joueur et création de l'OZ ID · Dev B
Parcours en étapes avec sauvegarde de la progression : compte → identité → caractéristiques sportives → rattachement → tuteur si mineur → photo.
Détection de minorité en temps réel qui fait apparaître le bloc tuteur, obligatoire et bloquant.
Validation Zod partagée à chaque étape ; possibilité de reprendre plus tard ; formulaire fonctionnel sur connexion faible.
**Sortie :** OZ ID attribué à la validation ; parcours E2E vert, y compris le cas mineur ; test de reprise après interruption.

#### Lot 1.8 — Inscription organisation · Dev B
Six types d'organisations avec formulaires différenciés, documents justificatifs, rattachement du dirigeant, invitation de membres.
**Sortie :** un compte de chaque type créé en recette et validé de bout en bout.

#### Lot 1.9 — Téléversement et coffre documentaire · Dev A
URL signées, vérification MIME réelle, antivirus, ré-encodage, calcul d'empreintes, purge programmée, accès exclusivement par URL éphémère.
**Sortie :** un fichier de test EICAR est rejeté ; une image contenant une charge utile est neutralisée par le ré-encodage ; aucune URL de document n'est accessible sans signature valide.

#### Lot 1.10 — KYC niveaux 0 à 2 et double vérification · Dev A
Tout le chapitre 7 : soumission, contrôles automatiques, OCR, concordance, score de risque, aiguillage, machine à états.
**Sortie :** le pipeline complet tourne sur 100 dossiers synthétiques incluant des cas frauduleux préparés ; les cas mineurs partent systématiquement en revue humaine ; règle des quatre yeux vérifiée par test.

#### Lot 1.11 — Back-office d'administration · Dev A
File de revue KYC priorisée, écran de décision avec écarts surlignés, gestion des comptes, gestion des rôles, suspension, consultation du journal d'audit, tableau de bord opérationnel, double validation.
**Sortie :** un administrateur traite un dossier de bout en bout en moins de 90 secondes ; toute action est retrouvable dans le journal d'audit.

#### Lot 1.12 — Chargement des données des inscrits (import de masse) · Dev B
*C'est le second volet explicite de la commande.*

- Import CSV et Excel, jusqu'à 10 000 lignes par fichier
- **Assistant de correspondance** : l'utilisateur associe les colonnes de son fichier aux champs OZ ; la correspondance est mémorisée par organisation pour les imports suivants
- **Validation en deux passes** : passe 1 à blanc (aucune écriture, rapport complet des erreurs ligne par ligne) ; passe 2 d'exécution après confirmation explicite
- Détection de doublons contre la base existante et à l'intérieur du fichier
- Traitement asynchrone en file avec progression en temps réel
- Génération de l'OZ ID pour chaque ligne valide, en statut `DECLARED`
- Rapport final téléchargeable : lignes acceptées, rejetées avec motif, doublons fusionnés ou signalés
- **Réversibilité** : tout import est annulable dans les 72 h, en une opération
- Import de photos par archive ZIP, appariées par nom de fichier
- Traçabilité : chaque profil importé conserve la référence de son import d'origine

**Sortie :** import de 10 000 lignes traité en moins de 5 minutes ; rapport exact ; annulation testée et complète ; aucune donnée orpheline après annulation.

#### Lot 1.13 — Profil joueur et visibilité · Dev B
Fiche complète, sérialisation différenciée par rôle du consultant, badges de vérification lisibles d'un coup d'œil, réglages de visibilité, QR code, export PDF du profil filigrané.
**Sortie :** matrice de visibilité testée pour les sept rôles ; aucun champ interdit présent dans la réponse réseau (vérifié par test d'inspection de payload).

#### Lot 1.14 — Recherche version 1 · Dev B
Filtres : pays, région, ville, âge, poste, pied fort, taille, poids, statut de vérification, organisation.
Tri, pagination par curseur, sauvegarde de recherches, export CSV filigrané et quota.
**Sortie :** p95 < 300 ms sur 100 000 profils synthétiques ; les mineurs n'apparaissent jamais pour un recruteur non vérifié KYC 3.

#### Lot 1.15 — Notifications et emails transactionnels · Dev B
Confirmation d'email, OTP SMS, décision KYC, rapport d'import, invitation de membre, alerte de sécurité (nouvelle connexion), préférences de notification, désinscription.
**Sortie :** gabarits testés sur les principaux clients de messagerie ; taux de délivrabilité vérifié ; SPF, DKIM et DMARC configurés.

#### Lot 1.16 — Journal d'audit et registre RGPD · Dev A
Journal à hash chaîné, partitionné, consultable ; export des données personnelles ; procédure de suppression de compte avec anonymisation ; registre des traitements.
**Sortie :** un utilisateur obtient l'export complet de ses données ; une suppression laisse zéro donnée personnelle et conserve les agrégats anonymes.

#### Lot 1.17 — Durcissement, charge et recette · Dev A + Dev B
Test de charge k6 (inscription, recherche, téléversement), test d'intrusion interne selon la grille OWASP, revue de sécurité croisée, correction des écarts, runbooks, procédure de restauration testée, plan de bascule.
**Sortie :** 200 utilisateurs simultanés sans dégradation ; aucune vulnérabilité critique ou haute ouverte ; restauration de sauvegarde réussie en conditions réelles. **[BLOQUANT]**

#### Lot 1.18 — Mise en production et ouverture des inscriptions · Dev A + Dev B
Bascule DNS, surveillance renforcée 72 h, canal d'incident, ouverture progressive (liste d'attente puis ouverture générale), tableau de bord des KPI d'adoption.
**[JALON J2]**

#### Critères d'acceptation de la Phase 1

| # | Critère | Mesure |
|---|---|---|
| 1 | Les sept types de comptes peuvent s'inscrire et être vérifiés | Démonstration complète des 7 parcours |
| 2 | Un joueur obtient un OZ ID unique et un badge « profil vérifié » après KYC 2 | Parcours E2E vert |
| 3 | Un mineur ne peut pas être publié sans tuteur vérifié | Test bloquant automatisé |
| 4 | Une organisation charge 10 000 inscrits par fichier avec rapport et annulation | Import réel chronométré |
| 5 | Un recruteur non vérifié ne voit aucun profil de mineur | Test de matrice de rôles |
| 6 | Aucune vulnérabilité critique ou haute | Rapport Trivy + audit + revue |
| 7 | p95 API < 300 ms, p95 pages < 2,5 s en 3G simulée | Rapport k6 + Lighthouse |
| 8 | Sauvegarde restaurée avec succès | Procès-verbal de restauration |
| 9 | Documents légaux publiés | Vérification en ligne |
| 10 | Couverture de tests conforme à R6 | Rapport de couverture CI |

---

### PHASE 2 — GESTION, MÉMOIRE ET MOBILE

| Lot | Contenu | Dépend de |
|---|---|---|
| 2.1 | Module `performance` : catalogue des 6 tests, sessions de test, saisie, bornes physiologiques par catégorie d'âge | 1.4, 1.10 |
| 2.2 | Certification à la source : compte centre, 2FA, scan QR de l'OZ ID, signature de session | 2.1 |
| 2.3 | Soumission externe de tests et de preuves, revue et certification différenciée | 2.1, 1.9 |
| 2.4 | Courbes de progression, comparaison à la cohorte d'âge | 2.1 |
| 2.5 | Module `roster` : effectifs, affectation, mouvements, entrées et sorties | 1.8 |
| 2.6 | Module `history` : mémoire de carrière automatique, chronologie, événements de parcours | 2.5 |
| 2.7 | Tableau de bord Académie | 2.5, 2.1 |
| 2.8 | Tableau de bord Club | 2.5, 2.1 |
| 2.9 | Tableau de bord Fédération : vue nationale agrégée, appui à la validation des licences | 2.5 |
| 2.10 | Module `billing` : paliers, Stripe, mobile money, quotas appliqués, portail client, factures | 1.4 |
| 2.11 | Application mobile (React Native / Expo) : profil, soumission, recherche rapide, notifications | API Phase 1 + 2 |
| 2.12 | Recherche version 2 : critères de performance (VMA, sprint), comparaison de profils | 2.1, 1.14 |

**[JALON J3]** — OZ est un outil de travail quotidien pour les organisations, et la plateforme encaisse ses premiers abonnements.

---

### PHASE 3 — INTELLIGENCE

| Lot | Contenu |
|---|---|
| 3.1 | Migration du moteur de recherche vers Meilisearch, indexation incrémentale |
| 3.2 | Comparaison automatique de profils, profils similaires, radar de qualités |
| 3.3 | Scoring de potentiel : modèle explicable, jamais une boîte noire — chaque score affiche ses facteurs |
| 3.4 | Rapports automatiques PDF : dossier joueur, dossier de détection, rapport d'académie |
| 3.5 | Analytique avancée, cohortes, tableaux de bord institutionnels |
| 3.6 | Détection statistique de fraude et audit automatique des centres |
| 3.7 | Réplicas de lecture, mise à l'échelle horizontale, optimisation des requêtes |

> **Garde-fou éthique inscrit dans le plan :** aucun scoring algorithmique ne produit une décision automatique sur la carrière d'un mineur. Le score est une aide à la lecture, présenté avec ses facteurs et sa marge d'incertitude. Il est auditable et contestable.

**[JALON J4]**

---

### PHASE 4 — RELATION ET PREUVE ENRICHIE

| Lot | Contenu |
|---|---|
| 4.1 | Module `media` : téléversement vidéo, transcodage adaptatif, vignettes, diffusion par CDN |
| 4.2 | Bibliothèque de séquences, temps forts, montage simple |
| 4.3 | Vérification renforcée des vidéos : métadonnées, détection de manipulation, empreinte |
| 4.4 | Messagerie encadrée : **jamais de contact direct avec un mineur** — passage obligatoire par l'organisation ou le tuteur, tout échange journalisé, signalement intégré |
| 4.5 | Demandes de contact structurées, suivi, statistiques de mise en relation |

**[JALON J5]**

---

### PHASE 5 — ÉCOSYSTÈME

| Lot | Contenu |
|---|---|
| 5.1 | OZ Legal : bibliothèque de contrats, alertes de conformité, accompagnement des mineurs |
| 5.2 | OZ Career : orientation, jalons de carrière, mise en relation qualifiée |
| 5.3 | Marketplace : catalogue de services, prestataires vérifiés, transactions, commissions |
| 5.4 | OZ Band : passerelle d'ingestion de données d'objet connecté, agrégation de charge et de récupération |
| 5.5 | API publique et partenaires : clés, quotas, documentation, bac à sable |
| 5.6 | Multilingue complet (anglais, portugais), expansion multi-pays |

**[JALON J6]**

---

## 9. Matrice de dépendances — ordre de merge imposé

```
0.1 ─► 0.2 ─► 0.3 ─┬─► 0.5 ─► 0.6 ─► 0.7 ─► 0.8 ─► 0.9 ─► 0.11
                   └─► 0.4 ─► 0.10

1.1 ─┬─► 1.2 ─────────────────────────► 1.7
     ├─► 1.3 ─► 1.4 ─┬─► 1.9 ─► 1.10 ─► 1.11
     │               ├─► 1.13 ─► 1.14
     │               └─► 1.16
     └─► 1.5 ─┬─► 1.6
              ├─► 1.7 ─► 1.8 ─► 1.12
              └─► 1.15

1.11 + 1.12 + 1.14 ─► 1.17 ─► 1.18 ─► [J2]
```

**Chemin critique de la Phase 1 :** `1.1 → 1.3 → 1.4 → 1.9 → 1.10 → 1.11 → 1.17 → 1.18`.
Tout retard sur ce chemin décale le jalon. Les lots hors chemin critique (1.6, 1.13, 1.15) absorbent les aléas.

**Règle de parallélisation :** Dev A avance sur le chemin critique (données, sécurité, KYC, back-office) pendant que Dev B avance sur la chaîne d'interface (design system, parcours d'inscription, import, recherche). Les deux se rejoignent sur `contracts` — qui est donc le seul fichier partagé nécessitant une coordination explicite. Toute modification de `packages/contracts` est annoncée avant d'être poussée.

---

## 10. Infrastructure et environnements

### 10.1 Les quatre environnements

| Environnement | Domaine | Données | Déploiement | Accès |
|---|---|---|---|---|
| **Local** | `localhost` | Synthétiques | Docker Compose | Développeurs |
| **Prévisualisation** | `pr-<n>.oz-preview.app` | Synthétiques | Automatique par PR, détruit au merge | Équipe |
| **Recette** | `staging.oz-...` | Anonymisées | Automatique au merge sur `develop` | Équipe + porteur produit, protégé par mot de passe |
| **Production** | `www.oz-...` | Réelles | Manuel, depuis `release/*`, avec approbation | Public |

**[BLOQUANT]** Aucune donnée personnelle réelle en dehors de la production (règle R10). Le script d'anonymisation qui alimente la recette est lui-même testé et versionné.

### 10.2 Pipeline CI/CD

```
Push sur une branche
  ├─ 1. Installation (cache pnpm + Turborepo)
  ├─ 2. Lint + format + commitlint
  ├─ 3. Typecheck strict
  ├─ 4. Tests unitaires + couverture (seuils R6)          ◄ BLOQUANT
  ├─ 5. Tests d'intégration (Testcontainers PostgreSQL)   ◄ BLOQUANT
  ├─ 6. Build de toutes les applications
  ├─ 7. gitleaks + npm audit + Trivy + CodeQL             ◄ BLOQUANT sur critique/haute
  ├─ 8. Vérification des migrations (up puis down)        ◄ BLOQUANT
  ├─ 9. Environnement de prévisualisation
  └─ 10. Tests E2E Playwright sur la prévisualisation     ◄ BLOQUANT

Merge sur develop
  ├─ Déploiement automatique en recette
  ├─ Migrations appliquées
  └─ Fumage automatique (10 parcours critiques)

Création de release/x.y.0
  ├─ Génération du CHANGELOG
  ├─ Gel, campagne de tests de recette
  ├─ Approbation manuelle requise                          ◄ BLOQUANT
  ├─ Sauvegarde de la base AVANT migration                 ◄ BLOQUANT
  ├─ Déploiement bleu-vert
  ├─ Fumage en production
  └─ Retour arrière automatique si le fumage échoue
```

### 10.3 Topologie de production — Phase 1

| Composant | Dimensionnement de départ | Seuil de montée en charge |
|---|---|---|
| API | 2 conteneurs, 2 vCPU / 4 Go | CPU > 70 % sur 5 min → +1 |
| Web | 2 conteneurs, 1 vCPU / 2 Go | idem |
| Worker | 1 conteneur, 2 vCPU / 4 Go | profondeur de file > 500 → +1 |
| PostgreSQL | 4 vCPU / 8 Go / 100 Go SSD | 70 % de disque ou p95 requête > 100 ms |
| Redis | 1 Go | 70 % de mémoire |
| Stockage objets | À la consommation | — |
| ClamAV | 1 conteneur, 2 Go | file antivirus > 200 |

### 10.4 Reprise après sinistre

| Scénario | RTO | RPO | Procédure |
|---|---|---|---|
| Perte d'un conteneur applicatif | 2 min | 0 | Redémarrage automatique |
| Corruption de base | 4 h | 15 min | Restauration snapshot + rejeu WAL — **runbook testé mensuellement** |
| Perte de l'hébergeur | 24 h | 15 min | Reconstruction Terraform + restauration hors site |
| Compromission de sécurité | Immédiat | — | Révocation de tous les jetons, rotation des secrets, gel des inscriptions, notification sous 72 h |

Chaque scénario dispose d'un runbook dans `docs/runbooks/`, écrit pour être exécuté sous stress par quelqu'un qui n'a pas conçu le système.

---

## 11. Qualité et tests

### 11.1 Pyramide de tests

| Niveau | Outil | Volume cible | Ce qui est testé |
|---|---|---|---|
| Unitaire | Vitest | ~70 % | Logique pure : OZ ID, checksum, calcul d'âge, scoring, règles métier |
| Intégration | Supertest + Testcontainers | ~25 % | Endpoints avec base réelle, transactions, RLS, permissions |
| Bout en bout | Playwright | ~5 % | Parcours critiques uniquement |
| Charge | k6 | Par phase | Inscription, recherche, import, téléversement |
| Sécurité | OWASP ZAP + revue manuelle | Par phase | Grille du §6.4 |
| Accessibilité | axe-core + Lighthouse | Continu | AA sur tous les parcours publics |

### 11.2 Parcours E2E obligatoires en Phase 1

1. Inscription joueur majeur → KYC 2 → badge vérifié
2. Inscription joueur mineur → blocage sans tuteur → tuteur vérifié → publication
3. Inscription académie → import de 100 joueurs → rapport → annulation
4. Recruteur non vérifié → recherche → aucun mineur visible
5. Recruteur KYC 3 → recherche multicritère → consultation de profil → journalisation vérifiée
6. Administrateur → file KYC → décision quatre yeux sur un mineur
7. Réinitialisation de mot de passe complète
8. Réutilisation d'un refresh token → révocation de la famille
9. Export des données personnelles → suppression de compte → anonymisation vérifiée
10. Téléversement d'un fichier infecté → rejet + alerte

### 11.3 Jeux de données de test

`packages/testing` fournit des factories déterministes produisant : 10 000 joueurs synthétiques répartis par âge, pays et poste · 50 organisations de chaque type · 20 dossiers KYC frauduleux préparés (document altéré, selfie d'écran, doublon, incohérence de date) · fichiers d'import volontairement sales (colonnes manquantes, encodages mélangés, dates ambiguës, doublons internes).

> Un système anti-fraude qui n'est testé que sur des cas honnêtes n'est pas testé.

---

## 12. Observabilité et exploitation

### 12.1 Ce qui est instrumenté

- **Logs** : JSON structuré, `requestId` propagé de bout en bout, jamais de donnée personnelle en clair dans un log **[BLOQUANT]**
- **Métriques** : latence par endpoint (p50/p95/p99), taux d'erreur, profondeur des files, durée des jobs, taux d'approbation KYC, délai moyen de vérification
- **Traces** : OpenTelemetry sur les parcours d'inscription et de KYC
- **Métier** : inscriptions/jour, taux de complétion de l'onboarding par étape (là où les gens abandonnent), délai KYC, taux de rejet par motif

### 12.2 Alertes (avec destinataire et runbook)

| Alerte | Seuil | Gravité |
|---|---|---|
| Taux d'erreur 5xx | > 1 % sur 5 min | Critique |
| Latence p95 API | > 800 ms sur 10 min | Haute |
| File KYC en attente | > 200 dossiers ou > 48 h | Haute (métier) |
| Échec de sauvegarde | Toute occurrence | Critique |
| Antivirus : fichier infecté | Toute occurrence | Haute (sécurité) |
| Pic d'inscriptions anormal | > 5× la moyenne horaire | Haute (fraude) |
| Certificat TLS | < 14 jours | Moyenne |
| Disque base | > 80 % | Haute |

### 12.3 Objectifs de service (SLO) Phase 1

Disponibilité 99,5 % · p95 API < 300 ms · p95 page en 3G < 2,5 s · délai de décision KYC < 48 h ouvrées · zéro perte de données.

---

## 13. Amélioration continue

### 13.1 Mécanismes inscrits dans le processus

| Mécanisme | Fréquence | Sortie |
|---|---|---|
| Revue de dette technique | Bimensuelle | `DEBT.md` mis à jour, un élément traité par sprint minimum |
| Revue de dépendances | Mensuelle | Montées de version groupées, testées |
| Revue de sécurité | Par phase | Rapport + plan de correction daté |
| Analyse des abandons d'onboarding | Continue | Optimisation de l'étape la plus coûteuse |
| Analyse des motifs de rejet KYC | Mensuelle | Amélioration des consignes utilisateur en amont |
| Revue de performance des requêtes | Mensuelle | `pg_stat_statements`, top 20, index ajoutés |
| Rétrospective | Fin de phase | Ajustements de méthode consignés |
| Tech radar | Trimestriel | Adopter / Essayer / Évaluer / Éviter |

### 13.2 Principe des drapeaux et de la mesure

Toute fonctionnalité notable est livrée derrière un drapeau, activée d'abord pour un échantillon, mesurée, puis généralisée ou retirée. On n'ajoute pas de fonctionnalité à l'aveugle sur une plateforme dont la valeur dépend de la confiance : chaque ajout est mesuré sur l'adoption, la complétion et le taux de vérification.

---

## 14. Propositions d'implémentation — apport d'expertise

Ces propositions ne figurent pas dans le Document de Projet. Elles sont classées par impact et par coût. Aucune n'est engagée sans arbitrage du porteur produit.

| # | Proposition | Pourquoi c'est utile ici | Phase | Effort |
|---|---|---|---|---|
| **P1** | **Carte OZ ID imprimable avec QR** | En contexte de terrain, un joueur montre une carte. Le QR ouvre le profil vérifié. Coût quasi nul, effet d'adoption fort, viralité naturelle. | 1 | Faible |
| **P2** | **Mode dégradé hors ligne pour l'inscription** | Formulaire en cache local, envoi différé à la reconnexion. Répond directement au §12.4 du Document de Projet. | 1 | Moyen |
| **P3** | **Parrainage académie → joueurs** | Un lien d'invitation nominatif par académie : elle amène ses joueurs, ils arrivent pré-rattachés. C'est le levier d'adoption identifié au §17.3 du Document de Projet, outillé. | 1 | Faible |
| **P4** | **Score de complétude du profil** | Barre de progression + suggestion de la prochaine action. Augmente mécaniquement la qualité de la base — l'un des trois enjeux majeurs du projet. | 1 | Faible |
| **P5** | **Portail tuteur dédié** | Le tuteur voit qui consulte le profil de son enfant, valide les mises en relation, révoque un accès. Transforme une contrainte réglementaire en argument commercial. | 2 | Moyen |
| **P6** | **Attestation PDF vérifiable** | Dossier joueur exporté, signé, avec QR de vérification en ligne. Vérifiable par un club étranger sans compte OZ. C'est le passeport, matérialisé. | 2 | Moyen |
| **P7** | **Webhooks et API partenaires** | Un club connecte son propre outil. Verrouille l'écosystème autour d'OZ bien plus solidement qu'une interface. | 3 | Moyen |
| **P8** | **Détection de doublons par graphe** | Au-delà du doublon simple : réseaux de comptes liés par appareil, IP, document, parrain. C'est ainsi qu'on attrape la fraude organisée. | 3 | Élevé |
| **P9** | **Comparaison à la cohorte nationale** | « VMA supérieure à 87 % des U17 camerounais mesurés. » Transforme une donnée brute en argument compréhensible par tous. | 3 | Moyen |
| **P10** | **Journal de consultation visible du joueur** | « 3 recruteurs ont consulté ton profil ce mois-ci. » Rétention côté joueur, transparence, et incitation forte au premium. | 2 | Faible |
| **P11** | **Mode observateur pour la fédération** | Vue nationale en lecture seule, sans accès aux données individuelles sensibles. Facilite la signature de partenariats institutionnels. | 2 | Moyen |
| **P12** | **Registre de preuves à hash chaîné, ancré périodiquement** | Publication mensuelle d'un hash racine. Preuve mathématique de non-altération rétroactive, sans blockchain, sans coût. Argument décisif face à un club européen sceptique. | 3 | Moyen |

**Recommandation d'engagement immédiat en Phase 1 :** P1, P3 et P4. Coût cumulé faible, effet direct sur les deux enjeux critiques du démarrage — l'adoption et la qualité de la donnée.

---

## 15. Livrables documentaires obligatoires

| Document | Emplacement | Échéance | Responsable |
|---|---|---|---|
| Ce plan d'exécution | `docs/PLAN.md` | J0 | Direction technique |
| ADR 001 à 008 | `docs/adr/` | Fin Phase 0 | Les deux |
| Schéma de données + diagramme ER | `docs/data/` | Lot 1.1 | Dev A |
| Spécification OpenAPI | `docs/api/` (généré) | Continu | Automatique |
| Matrice des rôles et droits testée | `docs/security/rbac.md` | Lot 1.4 | Dev A |
| Politique de sécurité | `docs/security/policy.md` | Fin Phase 0 | Dev A |
| Modèle de menaces | `docs/security/threats.md` | Fin Phase 0 | Dev A |
| Registre des traitements RGPD | `docs/security/gdpr-register.md` | Lot 1.16 | Dev A |
| Politique de confidentialité et CGU | Publiées en ligne | Avant 1.18 **[BLOQUANT]** | Porteur produit + juriste |
| Runbooks d'exploitation | `docs/runbooks/` | Lot 1.17 | Dev A |
| Guide administrateur back-office | `docs/guides/admin.md` | Lot 1.11 | Dev A |
| Guide utilisateur académie | `docs/guides/academy.md` | Lot 1.12 | Dev B |
| Storybook du design system | Déployé | Lot 1.5 | Dev B |
| CHANGELOG | `CHANGELOG.md` | Continu | Automatique |
| Rapport de recette de phase | `docs/releases/` | Chaque jalon | Les deux |
| Dossier de transfert de compétences | `docs/handover/` | Fin de projet | Les deux |

---

## ANNEXES

### Annexe A — Modèle d'ADR

```markdown
# ADR-XXX : <titre de la décision>
Statut : Proposé | Accepté | Remplacé par ADR-YYY
Date : AAAA-MM-JJ · Décideurs : <noms>

## Contexte
Quel problème se pose, quelles contraintes s'appliquent.

## Options envisagées
1. Option A — avantages / inconvénients / coût
2. Option B — avantages / inconvénients / coût

## Décision
Ce qui est retenu et pourquoi.

## Conséquences
Positives, négatives, ce que cela ferme, ce que cela ouvre.
Comment revenir en arrière si c'était une erreur.
```

### Annexe B — Modèle de Pull Request

```markdown
## Ticket
OZ-<numéro>

## Ce que fait cette PR
<3 lignes maximum>

## Definition of Done
- [ ] Tests unitaires et d'intégration écrits et verts
- [ ] Seuils de couverture atteints
- [ ] Test « rôle non autorisé » présent si nouvel endpoint
- [ ] Schéma OpenAPI à jour
- [ ] Migration réversible testée (up + down)
- [ ] Aucune donnée personnelle dans les logs
- [ ] Aucun secret, aucun TODO, aucun `any` non justifié
- [ ] Déployé et fumé en prévisualisation
- [ ] CHANGELOG mis à jour

## Points d'attention pour le relecteur
<sécurité, performance, choix discutable>

## Captures / démonstration
```

### Annexe C — Squelette `.env.example`

```bash
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

DATABASE_URL=postgresql://oz:oz@localhost:5432/oz
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=            # 64 octets aléatoires — jamais réutilisé entre environnements
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
ARGON2_MEMORY=19456

S3_ENDPOINT=
S3_BUCKET=oz-documents
S3_ACCESS_KEY=
S3_SECRET_KEY=
SIGNED_URL_TTL=300

CLAMAV_HOST=localhost
CLAMAV_PORT=3310

RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
RECAPTCHA_MIN_SCORE=0.5

RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MOBILE_MONEY_PROVIDER=cinetpay
MOBILE_MONEY_API_KEY=

SENTRY_DSN=
LOG_LEVEL=info

KYC_AUTO_APPROVE_THRESHOLD=25
KYC_AUTO_REJECT_THRESHOLD=70
KYC_MINOR_REQUIRES_DUAL_APPROVAL=true    # ne jamais passer à false
DOCUMENT_RETENTION_DAYS=90
```

### Annexe D — Checklist de mise en production [BLOQUANT]

**Avant**
- [ ] Toutes les [DoD] des lots de la phase sont validées
- [ ] Campagne de recette signée par le porteur produit
- [ ] Test de charge conforme aux SLO
- [ ] Revue de sécurité sans écart critique ou haut
- [ ] Sauvegarde manuelle prise et **restauration vérifiée**
- [ ] Migrations testées sur une copie de la base de production
- [ ] Documents légaux publiés
- [ ] Runbooks à jour, alertes configurées et testées
- [ ] Plan de retour arrière écrit et compris des deux intervenants
- [ ] Fenêtre de déploiement annoncée

**Pendant**
- [ ] Mode maintenance si la migration l'exige
- [ ] Déploiement bleu-vert, bascule progressive
- [ ] Fumage des 10 parcours critiques
- [ ] Surveillance active des métriques pendant 60 min

**Après**
- [ ] Surveillance renforcée 72 h
- [ ] Rapport de mise en production rédigé
- [ ] Rétrospective si incident
- [ ] `CHANGELOG` publié, version taguée

### Annexe E — Bornes physiologiques indicatives (module Performance, Phase 2)

Valeurs de plausibilité destinées à détecter les erreurs de saisie et les résultats aberrants — **jamais à juger un joueur**. À valider par un préparateur physique avant mise en service.

| Test | U13 | U15 | U17 | U20+ | Rejet si hors bornes |
|---|---|---|---|---|---|
| Sprint 10 m (s) | 1,80 – 2,60 | 1,70 – 2,40 | 1,60 – 2,20 | 1,55 – 2,10 | Oui |
| Sprint 30 m (s) | 4,60 – 6,20 | 4,30 – 5,70 | 4,00 – 5,30 | 3,90 – 5,10 | Oui |
| VMA (km/h) | 12,0 – 17,0 | 13,0 – 18,5 | 14,0 – 20,0 | 14,5 – 21,0 | Oui |
| Détente verticale (cm) | 20 – 45 | 25 – 55 | 30 – 70 | 30 – 80 | Oui |
| Yo-Yo (m) | 400 – 1600 | 600 – 2200 | 800 – 2800 | 800 – 3200 | Oui |
| Agilité (s) | 8,5 – 13,0 | 8,0 – 12,0 | 7,5 – 11,0 | 7,2 – 10,5 | Oui |

Toute valeur hors bornes est refusée à la saisie. Toute valeur dans les 5 % extrêmes est acceptée mais marquée `À CONFIRMER` et adressée à une revue.

### Annexe F — Glossaire technique

| Terme | Définition |
|---|---|
| **ADR** | Architecture Decision Record — trace écrite d'une décision structurante et de ses raisons |
| **Bounded context** | Module métier autonome, avec son vocabulaire et ses règles propres |
| **DoD / DoR** | Definition of Done / Definition of Ready |
| **RLS** | Row Level Security — filtrage des lignes appliqué par PostgreSQL lui-même |
| **RBAC / ABAC** | Contrôle d'accès par rôle / par attribut |
| **Bleu-vert** | Déploiement sur un environnement parallèle, puis bascule instantanée du trafic |
| **Pagination par curseur** | Pagination par pointeur sur le dernier élément lu, performante à grande échelle |
| **UUIDv7** | Identifiant unique triable chronologiquement |
| **Hash chaîné** | Chaque entrée du journal contient l'empreinte de la précédente : toute altération est détectable |
| **Empreinte perceptuelle** | Signature d'une image ou d'une vidéo qui résiste au recadrage et à la recompression |
| **Détection de vivacité** | Vérification qu'un selfie provient d'une personne réelle et non d'une photo ou d'un écran |
| **Règle des quatre yeux** | Décision sensible exigeant l'approbation de deux personnes distinctes |
| **SLO / RTO / RPO** | Objectif de service / délai de reprise / perte de données maximale admissible |
| **Feature flag** | Interrupteur permettant d'activer ou de désactiver une fonctionnalité sans redéployer |

---

## Clause finale

Ce document est la **référence d'exécution du projet OZ**. Il prévaut sur toute décision technique orale. Il évolue par version, et toute modification substantielle fait l'objet d'un ADR et d'une validation conjointe du porteur produit et de la direction technique.

Trois principes le résument :

1. **On construit de bas en haut, une branche à la fois, et rien n'est laissé à moitié.**
2. **Le serveur ne fait jamais confiance au client — sur rien.**
3. **La donnée d'un mineur est traitée comme si l'avenir du projet en dépendait, parce que c'est le cas.**

*Document confidentiel — diffusion restreinte aux signataires du NDA.*

— Fin du document —
