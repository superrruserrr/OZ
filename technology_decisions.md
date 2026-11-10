# OZ — Décisions technologiques (technology_decisions.md)

**Statut :** En cours (`/tech-stack` lancé le 2026-10-24)
**Sources :** `docs/PLAN.md` §4 (stack de référence) · `requirements.md` · `design.md`

## Objet

Ce fichier consigne chaque décision technologique d'OZ avec ses options, sa justification et ses compromis. Il est lu par `/plan-phase`, `/execute-phase` et `/commit-phase`. Toute décision structurante est aussi consignée en ADR dans `docs/adr/` (§4.3 du plan).

## Philosophie de décision

1. **Le plan technique a déjà tranché l'essentiel (§4.2).** On ne réinvente pas : on confirme, on comble les trous, on documente.
2. **Critères du plan, dans l'ordre (§4.1) :** maturité · cohérence (TypeScript de bout en bout) · réversibilité (aucun verrouillage fournisseur irréversible) · coût d'exploitation (tenir avant les premiers revenus).
3. **Contraintes propres à OZ :** données de mineurs, KYC, contexte africain (3G, mobile money), souveraineté de la donnée (DP §3.5).
4. **Toute dépendance passe par R12** (`DEPENDENCIES.md`).

## Contraintes confirmées

| Contrainte | Source |
|---|---|
| Équipe : Claude (Dev A + Dev B), Gaëtan Wassu seul approbateur | D-K06 |
| Poste de développement : macOS | Environnement de session |
| Données de mineurs, KYC, RGPD + loi camerounaise + Loi 25 + FIFA art. 19 | §6.8 du plan |
| Aucune donnée réelle hors production | R10 |
| Connexion 3G, appareils modestes, 320 px | EX-T22, DP §12.4 |
| Paiement mobile money obligatoire | §4.2 [BLOQUANT] |
| Région de données : Europe au départ, étude Afrique à l'expansion | §4.2, ADR-003 |
| Écartés par le plan : GraphQL, microservices, NoSQL, blockchain, BaaS intégral | §4.4 |
| Aucune date de jalon fixée | D-K07 |

## Journal des décisions

*(Les décisions sont ajoutées ci-dessous au fil de la séance.)*

**Méthode retenue (2026-10-24) :** confirmation en bloc des choix déjà tranchés par le plan (TD-001 à TD-008), puis discussion une par une des catégories ouvertes, avec quatre catégories ajoutées : paiements, SMS/OTP, observabilité, mobile.

> **Note de versions.** Le plan (août 2026) cite Node 22, Next.js 15, NestJS 11, Prisma 6, Zod 3.24. Ce sont des **planchers**, pas des cibles figées : au lot 0.1, on retient la dernière version stable de chaque outil et la LTS active de Node (Node 24 est LTS depuis octobre 2025 ; Node 22 passe en maintenance), en le consignant dans `DEPENDENCIES.md`.

---

### TD-001 — Langage et backend : TypeScript strict + NestJS sur Node.js LTS
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2, ADR-001)
- **Options considérées :** NestJS (modulaire, injection de dépendances, OpenAPI natif) · Fastify nu (rapide, mais structure à inventer) · Express nu (minimal, aucune structure)
- **Justification :** la modularité imposée par NestJS correspond aux bounded contexts du §3.4 et permet de mener deux chaînes de travail en parallèle sans collision ; un seul langage du formulaire à la base.
- **Compromis acceptés :** plus de « cérémonie » (décorateurs, modules) qu'Express ; démarrage un peu plus lent.
- **Dépendances :** TD-002 (Prisma), TD-003 (Next.js partage les schémas Zod).

### TD-002 — Données : PostgreSQL 16+ · Prisma · Redis + BullMQ
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2, §4.4) ; **mode d'hébergement de PostgreSQL ouvert** (TD-009)
- **Options considérées :** PostgreSQL (relationnel strict, RLS natif, FTS, `pgcrypto`) · MySQL (pas de RLS natif) · MongoDB (écarté §4.4 : données d'identité relationnelles)
- **Justification :** contraintes d'intégrité (C4), RLS pour le cloisonnement, recherche plein texte suffisante jusqu'à 200 000 profils, chiffrement colonne.
- **Compromis acceptés :** Prisma gère mal certaines fonctions avancées (RLS, partitionnement, `pgcrypto`) → migrations SQL brutes pour ces cas, documentées.
- **Dépendances :** TD-009 (hébergement), RLS testée en intégration (TD-006).

### TD-003 — Frontend : Next.js (App Router) + TanStack Query + React Hook Form + Zod
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2)
- **Options considérées :** Next.js (rendu serveur, SEO des pages publiques, streaming) · Remix / React Router 7 (bon en connexion faible, écosystème plus petit) · SPA Vite (pas de rendu serveur → mauvais en 3G et pour le SEO)
- **Justification :** rendu serveur indispensable en 3G (EX-T22) et pour le site public ; schémas Zod partagés avec l'API (EX-T04).
- **Compromis acceptés :** complexité des composants serveur / client ; dépendance à l'écosystème Vercel pour certaines fonctions (évitée : auto-hébergement).

### TD-004 — Environnement de développement local : macOS + Docker Compose
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan lot 0.2)
- **Justification :** un seul `docker compose up` lève PostgreSQL, Redis, MinIO, ClamAV, Mailpit ; parité stricte avec la recette et la production (Linux en conteneur).
- **Notes d'environnement :** développement sur macOS, production Linux → **tout tourne en conteneur**, la CI teste sur Linux (Ubuntu). `.gitattributes` force LF. Docker Desktop ou OrbStack sur Mac ; ClamAV demande ≈ 2 Go de RAM au conteneur.

### TD-005 — Authentification : implémentation propriétaire (Argon2id, JWT + rotation, TOTP)
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2, §6.2, ADR-002)
- **Options considérées :** propriétaire NestJS · Auth0 / Clerk (rapides, mais l'identité vérifiée est le cœur de valeur et les données partiraient chez un tiers hors UE) · Keycloak / Zitadel auto-hébergé (robuste, mais lourd à opérer pour une équipe d'une personne)
- **Justification :** l'identité vérifiée *est* le produit ; minorité calculée à chaque requête ; contrôle total sur la rotation et la détection de réutilisation.
- **Compromis acceptés :** responsabilité sécurité entière → couverture de tests à 100 % (R6) et revue adversariale systématique.

### TD-006 — Tests : Vitest · fast-check · Supertest + Testcontainers · Playwright · k6
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2, §11) ; `fast-check` ajouté pour les propriétés de `design.md` §4
- **Notes d'environnement :** Testcontainers requiert Docker sur le Mac et en CI (Linux) ; Playwright exécuté en CI sur Linux, navigateurs Chromium + WebKit (Safari iOS) + profil mobile Android.

### TD-007 — Mobile (Phase 2) : React Native + Expo
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan lot 2.11)
- **Options considérées :** Expo (TypeScript, réutilise `packages/contracts`, mises à jour OTA) · Flutter (performant, mais second langage et aucun partage de schémas) · PWA seule (pas de stockage sécurisé natif, notifications limitées sur iOS)
- **Justification :** même langage, mêmes schémas Zod, même API ; stockage sécurisé Keychain/Keystore.
- **Compromis acceptés :** performances moindres que du natif sur appareils très modestes → budget d'effets réduit (design.md §8.7).
- **Note :** pas de PWA installable en Phase 1 : le web conçu d'abord pour le téléphone suffit à l'ouverture (Q16, tranchée le 2026-11-10).

### TD-008 — Fondations UI/UX : WCAG AA · thèmes clair et sombre · Tailwind + shadcn/ui + Radix
- **Date :** 2026-10-24 · **Statut :** Confirmé (plan §4.2, `design.md` §8)
- **Accessibilité :** WCAG 2.1 AA, Lighthouse ≥ 90.
- **Référence visuelle :** maquettes `EX CHART/` ; jetons et effets de `design.md` §8.
- **Bibliothèque de composants :** shadcn/ui (code possédé dans `packages/ui`) sur primitives Radix.
- **Schéma de couleurs :** clair par défaut et sombre selon le réglage de l'appareil, charte OZ Football ID (ADR-009, lot 1.5a ; remplace « sombre natif »).
- **Compromis acceptés :** pas de bascule manuelle entre les modes en 1.5a (DEBT D-126) ; chaque écran vérifié dans les deux modes.
- **Complément (lot 0.10, D4-D5) :** composants shadcn adaptés à la main (pas de CLI shadcn) sur Radix Slot, Label, Select, Dialog et Toast ; variantes `class-variance-authority`, fusion `clsx` + `tailwind-merge` étendu aux couleurs `oz-*` ; icônes en SVG inline (pas de bibliothèque d'icônes) ; aucun texte en dur, tous les libellés arrivent traduits par les props. Effets E3-E5 en CSS seul, ombre et mise à l'échelle sous `motion-safe`.

### TD-009 — Hébergement Phases 1-2 : Scaleway (Paris) — Instances + Coolify, PostgreSQL managé
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu · **ADR :** ADR-003
- **Options considérées :** Scaleway (base managée avec restauration à la minute, fournisseur unique, Paris) · OVHcloud (base managée, France) · Hetzner (le moins cher, base auto-gérée)
- **Justification :** équipe d'une personne → la base managée supprime l'opération la plus risquée (sauvegarde WAL, restauration, mises à jour) sur des données de mineurs, et tient le RPO de 15 min ; un seul fournisseur européen = un seul DPA ; cohérent avec la souveraineté de la donnée (DP §3.5) ; Scaleway est déjà la cible de Phase 3 du plan (§4.2), pas de migration.
- **Compromis acceptés :** coût mensuel supérieur à Hetzner ; dépendance à un fournisseur (atténuée : PostgreSQL standard, conteneurs Docker, Terraform → réversible).
- **Dépendances :** Coolify sur Instances pour API, web, admin, workers, ClamAV ; Redis : instance managée Scaleway ou conteneur (à trancher au lot 0.8) ; Cloudflare devant (DNS, CDN, WAF) ; Terraform avec le provider Scaleway.
- **Environnements :** local (Docker Compose) · prévisualisation par PR · recette · production, conformément au §10.1. La recette a sa propre base managée, alimentée par le script d'anonymisation (R10).
- **Notes d'environnement :** la restauration à la minute ne dispense pas du test de restauration mensuel (EX-T23) ; les runbooks décrivent la restauration via l'API Scaleway.

### TD-010 — Stockage objets : Scaleway Object Storage (Paris)
- **Date :** 2026-10-24 · **Statut :** Décidé (avec TD-009)
- **Options considérées :** Scaleway Object Storage (même fournisseur et DPA) · Cloudflare R2 (pas de frais de sortie, mais un fournisseur de plus) · MinIO auto-hébergé (charge d'exploitation)
- **Justification :** compatible S3 (URL signées de 5 min, EX-110), même région que la base, un seul DPA.
- **Compromis acceptés :** frais de sortie de données, atténués par le cache Cloudflare sur les médias publics (les documents d'identité ne sont jamais mis en cache).
- **À mettre en place au lot 0.8 :** versioning des buckets ; copie de secours vers une seconde région (Amsterdam), en natif ou par job planifié selon ce que propose Scaleway à ce moment-là (EX-T23) ; buckets séparés pour documents d'identité, médias et exports.
- **Local :** MinIO dans Docker Compose (même API S3).

### TD-011 — Email transactionnel : Scaleway Transactional Email + React Email
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu
- **Options considérées :** Scaleway TEM (Paris, même fournisseur) · Resend (meilleure expérience développeur, données aux États-Unis) · Brevo (France) · Postmark (meilleure délivrabilité, États-Unis)
- **Justification :** aucun DPA supplémentaire, aucun transfert hors UE pour des emails citant des mineurs et des tuteurs ; cohérence avec TD-009.
- **Compromis acceptés :** délivrabilité moins éprouvée que Postmark ; API plus sobre que Resend.
- **Dépendances :** gabarits en React Email (rendu HTML, indépendant du fournisseur) ; interface `EmailProvider` dans `apps/worker` pour basculer vers Brevo si la délivrabilité mesurée au lot 1.15 est insuffisante ; SPF, DKIM, DMARC configurés au lot 0.8 ; envois en file BullMQ (EX-117) ; local : Mailpit.

### TD-012 — SMS / OTP : Infobip (SMS + WhatsApp) en principal, Twilio en secours
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu
- **Options considérées :** Infobip (UE, connexions opérateurs en Afrique, WhatsApp) · Twilio (fiable, États-Unis, routes africaines variables) · Orange SMS API (Orange seulement) · agrégateur local (couverture MTN + Orange, maturité RGPD et documentation variables)
- **Justification :** l'OTP conditionne le KYC 1 ; WhatsApp est très répandu au Cameroun, souvent moins cher et indépendant de la saturation SMS ; fournisseur UE ; repli automatique pour ne jamais bloquer une inscription.
- **Compromis acceptés :** deux fournisseurs à configurer et à couvrir par un DPA (dont un transfert hors UE pour Twilio, limité au secours) ; tarification Infobip sur devis.
- **Dépendances :** interface `SmsProvider` (canaux `whatsapp` puis `sms`, bascule de fournisseur sur échec ou délai) ; limitation de débit OTP (EX-T18) ; OTP jamais journalisé en clair (EX-T19) ; numéro stocké chiffré.
- **À vérifier au lot 1.3 :** tarif réel vers MTN et Orange Cameroun ; enregistrement de l'identifiant d'expéditeur « OZ » ; approbation du modèle de message WhatsApp (authentification) ; taux de délivrance mesuré.
- **Local :** fournisseur factice qui écrit l'OTP dans les logs de développement uniquement.

### TD-013 — Paiements : Stripe (cartes) + CinetPay (MTN MoMo, Orange Money) derrière `PaymentProvider`
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu · **Phase :** 2 (lot 2.10) · **ADR :** ADR-006
- **Options considérées :** CinetPay (spécialiste Afrique francophone / CEMAC) · Flutterwave (panafricain, plus anglophone) · API directes MTN MoMo et Orange Money (commissions minimales, double intégration et contrats opérateurs) ; Stripe pour les cartes dans tous les cas.
- **Justification :** CinetPay couvre le Cameroun en XAF avec une seule API pour les deux opérateurs ; Stripe couvre les clubs et recruteurs étrangers (abonnements, portail client, factures).
- **Compromis acceptés :** deux fournisseurs, deux réconciliations ; commissions plus élevées que les API directes ; Flutterwave à ajouter pour l'expansion anglophone.
- **Règle de conception :** les abonnements payés par mobile money sont des **périodes prépayées** (mois, trimestre, an) avec rappels avant échéance et renouvellement validé sur le téléphone ; seuls les abonnements par carte (Stripe) se renouvellent automatiquement. L'état d'abonnement est calculé côté serveur à partir des paiements confirmés par webhook (CP-32, CP-33).
- **Dépendances :** webhooks signés et idempotents ; journal d'audit de chaque opération ; couverture 100 % (R6).
- **Ouvert :** entité qui encaisse et facture (Q20 de `requirements.md`) — détermine les comptes Stripe et CinetPay, la TVA et la conformité des factures. Une entité camerounaise ne peut pas détenir de compte Stripe.

### TD-014 — Observabilité : Sentry (UE) · Scaleway Cockpit · Better Stack (sondes)
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu
- **Options considérées :** Sentry UE + Cockpit + Better Stack · Sentry + Better Stack pour tout · Grafana/Loki/Prometheus auto-hébergés (plan, charge d'exploitation élevée)
- **Justification :** logs et métriques chez l'hébergeur sans DPA supplémentaire ni pile à maintenir ; Grafana managé ; sondes chez un tiers pour détecter une panne de Scaleway elle-même.
- **Compromis acceptés :** trois outils ; rétention Cockpit à vérifier.
- **Dépendances :** Sentry en région UE avec nettoyage des données personnelles avant envoi (en-têtes, corps, IP) ; logs JSON avec `requestId` (EX-T19) ; OpenTelemetry sur inscription et KYC (§12.1) ; alertes du §12.2 configurées dans Cockpit et Better Stack.
- **À vérifier au lot 0.9 :** rétention des logs Cockpit ≥ 12 mois (§6.4 A09) ; sinon export mensuel vers Object Storage chiffré.

### TD-015 — Inférence IA (KYC) : fournisseur spécialisé, présélection Veriff et Smile ID
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu ; fournisseur final choisi par POC au lot 1.10 · Répond à Q5
- **Options considérées :** fournisseur KYC spécialisé · tout construire en open source (vivacité irréaliste pour une équipe d'une personne, base biométrique de mineurs chez OZ, licences de modèles faciaux souvent non commerciales) · hybride OCR maison + biométrie fournisseur
- **Périmètre fournisseur :** OCR du document, détection de falsification, vivacité du selfie, concordance faciale, contrôle de doublon s'il est proposé. Le fournisseur **renvoie des signaux, il ne décide pas.**
- **Périmètre OZ (déterministe) :** antivirus, MIME réel, SHA-256 et empreinte de document, ré-encodage, concordance déclaratif ↔ OCR (Levenshtein normalisée), agrégation du score de risque 0-100, aiguillage, machine à états, quatre yeux, audit.
- **Critères du POC (bac à sable, aucune donnée réelle — R10) :** reconnaissance CNI et passeport camerounais (et acte de naissance pour KYC 3) · DPA avec données en UE · signaux détaillés et explicables (pas un simple oui/non) · désactivation de la conservation biométrique côté fournisseur · coût par vérification · SDK web et React Native.
- **Compromis acceptés :** coût par dossier ; dépendance limitée par une interface `IdentityVerifier` (réponses validées par schéma Zod ; toute réponse inattendue → revue humaine).
- **Conformité :** traitement de données biométriques (RGPD art. 9) dont des mineurs → **consentement explicite** (tuteur pour un mineur) et **AIPD obligatoire avant le lot 1.10** (EX-T24 n° 6).
- **LLM (voir aussi TD-016) :** aucun modèle de langage n'est nécessaire en Phases 0 à 2. Si OZ AI (Phase 3) en requiert un (rapports rédigés), la décision sera prise à ce moment-là, avec DPA, sans donnée identifiante de mineur dans les prompts, et sur la dernière génération de modèles Claude par défaut.

### TD-016 — AI Boundary Classification
- **Decision :** classification des frontières de l'IA pour OZ — option C « progressive » · Répond à Q3
- **Date :** 2026-10-24 · **Décidé par :** Gaëtan Wassu
- **Rationale :** la valeur d'OZ est le badge vérifié ; une erreur d'IA non relue l'attaque directement. On démarre sans aucune décision KYC prise sur la seule foi de l'IA, et on n'automatise l'approbation des majeurs qu'avec une preuve mesurée de concordance IA / humains. Le rejet automatique ne repose que sur des faits déterministes. Le §7.3 (« KYC 2 … + revue humaine ») prévaut donc sur le §7.4 au lancement.

**AI-OPERATIONAL components** (gating requis) — **inactif au lancement**, activable par drapeau `kyc.autoApproveAdults` :

| Component | Pre-validator | Schema enforcement | Post-audit |
|---|---|---|---|
| Approbation automatique KYC 2 d'un **majeur** (score < 25, aucun signal fort) | Antivirus `clean`, MIME réel, document non expiré, âge ≥ 18 calculé côté serveur, aucun doublon SHA-256, sujet ni tuteur ni recruteur/agence/centre | Réponse `IdentityVerifier` validée par schéma Zod strict ; toute réponse inattendue ou incomplète → revue humaine | 10 % des approbations automatiques revues chaque semaine ; contestation ouverte à l'utilisateur ; désactivation automatique du drapeau si le désaccord dépasse 1 % sur une fenêtre glissante ; chaque décision journalisée avec la version du modèle de score et les signaux |

**Condition d'activation [À CONFIRMER] :** ≥ 1 000 décisions humaines sur des majeurs, dont la tranche de score < 25 montre ≥ 99 % de concordance avec la décision humaine ; décision d'activation consignée en ADR et approuvée par Gaëtan Wassu.

**AI-ADVISORY components** (un humain relit) :

| Component | Reviewer | Acceptable because |
|---|---|---|
| Signaux fournisseur KYC (OCR, falsification, vivacité, concordance faciale, doublon) | Administrateur OZ ; deux administrateurs pour mineur, tuteur, recruteur, agence, centre | Les signaux alimentent un score déterministe ; la décision est humaine et motivée |
| Score de potentiel (Phase 3, EX-303) | Recruteur, club, académie (aide à la lecture) | Facteurs et incertitude affichés ; jamais de décision automatique sur un mineur ; contestable |
| Détection de manipulation des vidéos (Phases 2-4) | Administrateur OZ ou centre délégué | Résultat soumis restant « non certifié » jusqu'à décision humaine |
| Rapports rédigés par OZ AI (Phase 3, si LLM) | Destinataire du rapport, avec mention « généré » | Faits chiffrés injectés par le code, le texte ne calcule rien |

**Rejet automatique — DETERMINISTIC uniquement :** fichier infecté, MIME incohérent, document expiré, image illisible selon des seuils de qualité mesurés, âge hors bornes 6-45 ans, troisième rejet en 30 jours. **Aucun** rejet automatique sur un signal d'IA seul (vivacité, concordance faciale, falsification) : ces cas partent en revue humaine.

**DETERMINISTIC components using externally-sourced constants :**

| Component | Constants source | Verified against |
|---|---|---|
| Bornes physiologiques (EX-201) | Annexe E du plan (« indicatives ») | **À valider par un préparateur physique désigné avant le lot 2.1** (Q13) — champ `verified_against` obligatoire |
| Seuils d'aiguillage KYC (25 / 70) | Annexe C du plan | Recalibrés sur les données de revue humaine avant toute activation du drapeau |
| Paramètres Argon2id (m=19456, t=2, p=1) | §6.2 du plan (recommandation OWASP) | OWASP Password Storage Cheat Sheet, vérifiée au lot 1.3 |
| Règles d'âge et de catégories (U13…U20+) | Annexe E du plan | Règlements FECAFOOT / FIFA en vigueur, à vérifier au lot 2.1 |

**Default :** tout ce qui n'est pas listé ci-dessus est DETERMINISTIC, sans IA — dont l'OZ ID, l'âge, la minorité, la machine à états, les quatre yeux, les quotas, le score de risque (formule pondérée versionnée), la concordance déclaratif ↔ OCR, le dédoublonnage des imports, la recherche, la complétude et la détection statistique de dérive des centres.

> Après le build, lancer `/ai-governance audit` pour vérifier que le code respecte ces frontières.

### TD-017 — Checksum OZ ID : algorithme de Damm sur l'alphabet base 32 Crockford
- **Date :** 2026-10-24 · **Statut :** Décidé par Gaëtan Wassu · Répond à Q4 · **ADR :** ADR-007 (complément)
- **Options considérées :** Crockford mod 37 (plan : symboles `* ~ $ = U` incompatibles avec « sans U » et la dictée) · Luhn mod 32 (simple, ne détecte pas toutes les inversions de caractères voisins) · deux caractères ISO 7064 (sûr, plus long à dicter) · Damm base 32
- **Justification :** détecte 100 % des erreurs sur un caractère et 100 % des inversions de deux caractères voisins, avec un seul caractère de contrôle toujours issu de l'alphabet Crockford (lisible, dictable, sans I, L, O, U).
- **Calcul :** sur l'identifiant entier, tirets exclus : lettres du pays → rang 0-25 ; chiffres de l'année → valeur 0-9 ; partie aléatoire → valeurs Crockford 0-31. Le symbole de contrôle est l'élément de l'alphabet Crockford correspondant au résultat. La table de quasigroupe totalement anti-symétrique d'ordre 32 est générée une fois, vérifiée par test exhaustif, puis **figée à vie** dans `packages/core`.
- **Compromis acceptés :** une table de 32 × 32 à maintenir immuable ; un algorithme moins connu que Luhn (documenté dans l'ADR avec la référence de Damm, 2004).
- **Tests :** CP-01 (toute altération d'un caractère détectée), test exhaustif des inversions voisines, test de non-régression de la table (empreinte SHA-256 figée).

### TD-018 — Protection des branches : aucune approbation exigée, merge commit vers main
- **Date :** 2026-10-26 · **Statut :** Décidé par Gaëtan Wassu (lot 0.7) · Écart assumé au plan §2.3 (« 1 approbation »)
- **Options considérées :** 1 approbation exigée (plan ; impossible seul : GitHub refuse l'auto-approbation, il faudrait un second compte relecteur) · aucune approbation exigée, PR et cinq contrôles de CI obligatoires (retenue) · squash seul vers `main` (crée des commits absents de `develop`, conflits à la release suivante) · merge commit vers `main` (retenue)
- **Justification :** développeur seul avec Claude ; la revue croisée R14 passe par la revue adversariale de `/execute-phase` et l'acte de merge de Gaëtan Wassu, qui vaut approbation. `develop` reste en squash seul avec historique linéaire ; `main` reçoit les branches `release/*` et `hotfix/*` (contrôle de la CI) par merge commit, sans historique linéaire imposé.
- **Compromis acceptés :** aucune barrière technique n'empêche Gaëtan Wassu de merger une PR que la revue adversariale n'a pas examinée ; la CI verte reste obligatoire. À réviser dès qu'un second développeur rejoint le projet (approbation exigée).
- **Mise en œuvre :** `.github/rulesets/develop.json`, `.github/rulesets/main.json`, testés par `scripts/ci-workflow.test.mjs`.

---

### TD-019 — Infrastructure en code : Terraform, secrets en écriture seule, Redis managé
- **Date :** 2026-10-26 · **Statut :** Décidé par Gaëtan Wassu (lot 0.8b, D1-D6) · Tranche le point ouvert Redis de TD-009
- **Options considérées :** Terraform (plan §4) ou OpenTofu (MPL, chiffrement natif de l'état) · Redis managé Scaleway ou conteneur Coolify · secrets saisis à la main ou générés par Terraform
- **Justification :** Terraform comme prévu au plan, état dans un bucket Scaleway privé et versionné (verrouillage natif `use_lockfile`). Redis managé en recette et en production (TLS, réseau privé, aucune exploitation) ; conteneur pour les prévisualisations. Mots de passe et secrets JWT générés comme valeurs **éphémères** et transmis en écriture seule (`password_wo`, `data_wo`) : ni dans l'état, ni en sortie, seulement dans Secret Manager ; les versions des secrets suivent l'instance, le cluster et la clé. Base et Redis sans point d'accès public, joints en TLS épinglé sur l'autorité de chaque instance (`verify-ca`, D-006) ; les migrations Prisma, dont le moteur ne sait pas épingler, passent par un relais local épinglé (D-039). `prevent_destroy` sur les données et l'état.
- **Compromis acceptés :** la clé S3 de l'application reste dans l'état (D-037) ; production appliquée au lot 0.11 (D-036) ; copie hors région au lot 0.8d (D-034) ; RPO 15 min à confirmer (D-035) ; isolation des buckets par politique dans un projet partagé (D-040) ; verrou d'état à vérifier (D-042). Trivy n'a pas de règle propre à Scaleway : les propriétés de sécurité sont prouvées par `terraform test`.
- **Mise en œuvre :** `infra/terraform`, tests de sécurité `modules/stack/tests` (fournisseur simulé) et `scripts/terraform.test.mjs`, vérifiés par le job CI `security`.

### TD-020 — Banc d'essai du design system : Storybook 10, stories testées dans Chromium
- **Date :** 2026-10-27 · **Statut :** Décidé par Gaëtan Wassu (lot 0.10, D1-D3) · Remplace « Storybook 8 » du plan (EX-010)
- **Options considérées :** Storybook 8 (plan) · Storybook 10 · Ladle
- **Justification :** Storybook 8 n'est plus maintenu et ne prend en charge ni Vite 8 ni Vitest 5 ; la version 10 exécute chaque story comme un test Vitest dans Chromium (`@storybook/addon-vitest`), avec axe-core WCAG 2.1 AA bloquant (`a11y.test: 'error'`) et les interactions `play`. Ladle n'a ni contrôle d'accessibilité ni exécution en test. Télémétrie coupée (R12). Build statique publié en artefact CI (rétention 14 jours) ; hébergement reporté avec la recette (D-051).
- **Compromis acceptés :** chaîne Babel de Storybook qui tire `semver@6.3.1` sans attestation de provenance, exclu nominativement de `trustPolicy` (D-052) ; Chromium seul en test des stories (Firefox et WebKit couverts par les E2E à partir de la Phase 1).
- **Mise en œuvre :** `packages/ui/.storybook`, `vitest.storybook.config.ts` (projets `storybook` et `motion`), `pnpm test:stories` dans le job CI `build-e2e`.

---

## Synthèse de la stack

| Couche | Choix | TD |
|---|---|---|
| Langage, backend | TypeScript strict, NestJS, Node.js LTS | 001 |
| Données | PostgreSQL managé (Scaleway), Prisma, Redis + BullMQ | 002, 009 |
| Web | Next.js, TanStack Query, React Hook Form, Zod | 003 |
| Local | macOS + Docker Compose (PostgreSQL, Redis, MinIO, ClamAV, Mailpit) | 004 |
| Auth | Propriétaire : Argon2id, JWT + rotation, TOTP | 005 |
| Tests | Vitest, fast-check, Supertest + Testcontainers, Playwright, k6 | 006 |
| Mobile (Phase 2) | React Native + Expo | 007 |
| UI | WCAG AA, clair et sombre (ADR-009), Tailwind + shadcn/ui + Radix, `design.md` §8 | 008 |
| Hébergement | Scaleway Paris : Instances + Coolify, Cloudflare devant | 009 |
| Stockage | Scaleway Object Storage | 010 |
| Email | Scaleway Transactional Email + React Email | 011 |
| SMS / OTP | Infobip (WhatsApp + SMS), Twilio en secours | 012 |
| Paiements (Phase 2) | Stripe + CinetPay, mobile money prépayé | 013 |
| Observabilité | Sentry UE, Scaleway Cockpit, Better Stack | 014 |
| IA KYC | Fournisseur spécialisé (POC Veriff / Smile ID) | 015 |
| Frontières IA | Option progressive | 016 |
| OZ ID | Checksum de Damm base 32 | 017 |
| Design system | Storybook 10, stories testées dans Chromium avec axe-core | 020 |
