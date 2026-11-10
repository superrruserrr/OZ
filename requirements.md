# OZ — Exigences (requirements.md)

**Sources :** `OZ_Document_de_Projet.pdf` (v1.0, juillet 2026 — le pourquoi, pour qui, quoi) · `docs/PLAN.md` (OZ-PETF-2026-001, v1.0 — le comment) · maquettes `EX CHART/` · séance `/kickoff` du 2026-10-24
**Porteur produit :** Fabrice Olinga · **Direction technique :** Gaëtan Wassu / EXISTE · **Contact technique cité par le Document de Projet :** Jean Armand Honyigloh
**Statut :** Brouillon — à valider par le porteur produit
**Périmètre :** Phases 0 à 5, en détail

---

## 1. Introduction

### 1.1 Ce que nous construisons

OZ est une **place de marché à deux faces du football**, pensée sur le modèle « Uber du football » (§3.1). D'un côté l'offre de talent (joueurs, académies, clubs), de l'autre la demande (recruteurs, agences, clubs, fédérations). Entre les deux, un tiers de confiance — les **Centres OZ Performance** — certifie la donnée échangée.

Le problème central est la **fraude à l'âge et à l'identité** (§6.1, menace n° 1) : la valeur d'OZ tient entièrement au badge « profil vérifié ». Si ce badge peut être obtenu frauduleusement, le produit ne vaut rien (§7). Le second enjeu est la **protection des mineurs**, qui constituent une part importante de la base (§6.7).

Le marché de lancement est le **Cameroun**, avec une expansion prévue vers l'Afrique puis le monde (§3.1). Le contexte impose : connexion faible (3G), paiement par mobile money, multi-pays dès le schéma.

### 1.2 Phasage

| Phase | Nom | Livrable central | Jalon | Échéance |
|---|---|---|---|---|
| 0 | Fondations | Socle technique, CI/CD, environnements, sécurité de base | J0 → J1 | À confirmer |
| 1 | Web & Inscriptions | Web public, inscription des 7 profils, KYC, import de masse | J2 — production publique | À confirmer |
| 2 | Gestion & Mémoire | Performance, effectifs, historique, abonnements, mobile | J3 | À confirmer |
| 3 | Intelligence | Moteur de recherche dédié, comparaison, scoring, rapports | J4 | À confirmer |
| 4 | Relation & Preuve | Vidéo, messagerie encadrée | J5 | À confirmer |
| 5 | Écosystème | OZ Legal, OZ Career, Marketplace, OZ Band, API publique | J6 | À confirmer |

**Déclencheur J0** (§0.3) : signature du NDA mutuel, du contrat de développement et de cession de PI, de la convention de participation, et encaissement du premier versement. Avant J0, aucun dépôt de code, aucun accès environnement, aucune donnée réelle.

### 1.3 Décisions prises lors du kickoff

| ID | Décision | Conséquence |
|---|---|---|
| D-K01 | Le Document de Projet v1.0 a été fourni en cours de kickoff et intégré (personas, Annexe B, §12.2, paliers, KPIs) | Ses passages sont cités `DP §x.y` ; ce qui reste au-delà des deux documents est marqué **[À CONFIRMER]** |
| D-K02 | Les exigences couvrent les Phases 0 à 5 en détail | Les Phases 3 à 5 contiennent davantage d'hypothèses |
| D-K03 | Les 7 profils d'inscription sont : joueur, tuteur légal, académie, club, fédération, centre OZ Performance, recruteur | L'administrateur OZ est un rôle interne, non inscriptible |
| D-K04 | Les 6 types d'organisation sont : académie, club, fédération, centre, recruteur, agence de joueurs | L'agence exige le KYC 3 |
| D-K05 | L'agence de joueurs est une variante du profil recruteur (même parcours, mêmes droits) | Seul le justificatif KYC 3 diffère (licence d'agent) |
| D-K06 | Claude tient les rôles Dev A et Dev B ; Gaëtan Wassu est seul approbateur | R14 est adaptée (voir EX-T14) |
| D-K07 | Aucune date de jalon n'est fixée | Jalons sans échéance, à confirmer |
| D-K08 | Les propositions P1, P3 et P4 (§14) entrent dans le périmètre de Phase 1 | EX-119, EX-120, EX-121 |
| D-K09 | Les cibles d'adoption sont proposées par Claude, à confirmer | §5 de ce document |
| D-K10 | Le Document de Projet compte l'administrateur parmi les « sept profils » (DP §5.1) ; le kickoff retient le tuteur comme 7e profil d'inscription, l'administrateur restant un rôle interne. Les maquettes `EX CHART` (écran 02 « 7 types de compte ») suivent la décision du kickoff | Matrice EX-104 à 7 profils + admin |
| D-K11 | Les maquettes du dossier `EX CHART/` sont la référence de direction visuelle et d'architecture d'écrans | `design.md` §8 |
| D-K12 | En cas de conflit de **périmètre ou de calendrier** entre le Document de Projet et le plan technique, le plan technique prévaut (CLAUDE.md), et l'écart est listé en §6 | Voir §1.6 |

### 1.5 Personas (DP §5.2)

| Persona | Profil | Douleur principale | Ce qu'OZ change |
|---|---|---|---|
| **Junior, 16 ans** — milieu offensif, académie de l'Ouest camerounais | Joueur mineur | Aucun dossier fiable ; âge mis en doute ; pas de centre de test proche | OZ ID vérifié, tests certifiés en centre ou soumis, historique automatique |
| **M. Ngassa** — directeur d'une académie d'une centaine de jeunes | Académie | Tout « à la main » ; aucune vue d'ensemble ; le savoir part avec les éducateurs | Tableau de bord, import, vitrine des meilleurs talents |
| **Elena** — cellule de recrutement d'un club européen | Recruteur | Doute sur identité et âge ; coût d'un essai raté | Recherche multicritère sur profils vérifiés, présélection à distance |
| **Direction technique nationale** | Fédération | Aucune photographie nationale du vivier ; licences fastidieuses | Vue agrégée, statistiques, appui aux licences et sélections |
| **L'évaluateur** — préparateur en Centre OZ Performance | Centre | Mesures sans valeur reconnue hors de sa structure | Protocole standard, saisie horodatée, rôle de tiers de confiance |
| **Le parent / tuteur** *(ajout kickoff, DP §5.3)* | Tuteur | Peur des fausses promesses et des intermédiaires | Consentement, journal des consultations, contact jamais direct |

**Ce qu'OZ n'est pas (DP §3.3)** — contrainte de conception : ni un réseau social (pas de « likes »), ni une agence de joueurs (aucune commission sur les transferts), ni un annuaire, ni un outil réservé à l'élite.

### 1.6 Écarts entre le Document de Projet et le plan technique

| Sujet | Document de Projet | Plan technique | Position retenue |
|---|---|---|---|
| Contenu de la Phase 1 | Authentification, OZ ID, **OZ Performance**, Recherche, **Tableau de bord** (DP §14) | Web, inscriptions, KYC, import ; Performance et tableaux de bord en Phase 2 (§0.4, §8) | Plan technique (D-K12) — **à faire confirmer par Fabrice Olinga (Q15)** |
| Surface principale | Le mobile est « le point d'accès principal sur le terrain » (DP §7.2) | Pas de mobile en Phase 1 (§0.4) | Web Phase 1 conçu mobile-first à 320 px (EX-T22) ; Q16 |
| Sept profils | Inclut l'administrateur (DP §5.1) | « Sept rôles » sans liste | Tuteur = 7e profil (D-K03, D-K10) |
| Qui recherche | Académie : recherche « (limité) » (DP Annexe B) | Non précisé | Annexe B appliquée (EX-104) |

### 1.4 Conventions de ce document

- Chaque exigence porte un identifiant `EX-<phase><numéro>` (ex. `EX-110`) ou `EX-T<numéro>` pour les exigences transverses.
- **Source** renvoie à la section du plan technique (`§x.y`) ou à une décision du kickoff (`D-Kxx`).
- **Priorité** : **P0** indispensable à la phase · **P1** forte valeur, peut suivre de près · **P2** prise en compte architecturale uniquement.
- **Statut** : **Plan** (repris du plan technique) · **[À CONFIRMER]** (hypothèse de Claude ou écart à arbitrer) · **[À VALIDER]** (proposition du §14 non encore engagée par le porteur produit).
- Les critères d'acceptation suivent le format « LE Système DOIT… » et sont numérotés.
- **[BLOQUANT]** reprend le marqueur du plan : non contournable, non reportable.

---

## 2. Glossaire

| Terme | Définition |
|---|---|
| **OZ ID** | Identifiant métier unique et immuable d'un joueur, au format `OZ-CM-26-7K4M9Q-3` (§5.3). Distinct de l'identifiant technique UUIDv7. |
| **Profil d'inscription** | Un des 7 types de compte qu'une personne peut créer (D-K03). |
| **Joueur** | Personne physique dont le profil sportif est enregistré. Peut être majeur ou mineur. |
| **Mineur** | Joueur de moins de 18 ans, calculé à chaque requête à partir de la date de naissance (§6.7). |
| **Tuteur légal** | Parent ou représentant légal d'un joueur mineur. Dispose de son propre compte et doit être vérifié en KYC 2 (D-K03, §7.3). |
| **Organisation** | Entité morale : académie, club, fédération, centre OZ Performance, recruteur ou agence (D-K04). |
| **Centre OZ Performance** | Tiers de confiance habilité à mesurer et certifier les performances physiques (§3.1, §7.5). |
| **Recruteur / Scout** | Personne ou structure qui cherche des talents pour un club. Exige le KYC 3 (§7.3). |
| **Agence de joueurs** | Agent licencié représentant des joueurs ; variante du profil recruteur (D-K05). |
| **Administrateur OZ** | Membre interne de l'équipe OZ, chargé de la revue KYC et de la modération. Rôle non inscriptible. |
| **KYC 0 à 3** | Niveaux de vérification d'identité : Déclaré, Contact vérifié, Identité vérifiée, Identité renforcée (§7.3). |
| **Badge « Profil vérifié »** | Marqueur attribué au KYC 2 ; « Vérifié+ » au KYC 3. |
| **Dossier KYC** | Demande de vérification d'un sujet (joueur, tuteur ou organisation), avec ses documents, contrôles et décision (§5.2). |
| **Règle des quatre yeux** | Décision exigeant l'approbation de deux administrateurs distincts (§7.4). |
| **Score de risque** | Agrégation pondérée 0-100 des contrôles automatiques d'un dossier KYC (§7.4). |
| **Certification à la source (A)** | Performance mesurée en Centre OZ et signée par l'évaluateur (§7.5). |
| **Certification soumise (B)** | Performance mesurée ailleurs, soumise avec preuve et validée par revue (§7.5). |
| **Import de masse** | Chargement d'un fichier CSV/Excel d'inscrits par une organisation (§8, lot 1.12). |
| **Passe à blanc** | Première passe d'un import, sans aucune écriture, produisant le rapport d'erreurs. |
| **Sérialisation par vue** | Production d'une réponse différente selon le rôle du demandeur ; un champ non autorisé n'est jamais envoyé (§3.5). |
| **`packages/contracts`** | Paquet de schémas Zod partagés entre formulaires et API ; pivot de la double vérification (§3.3). |
| **C1 à C4** | Les quatre couches de validation : ergonomique, contractuelle, métier, intégrité (§7.2). |
| **Journal d'audit** | Journal immuable à hash chaîné des actions sensibles (R11). |
| **Recette** | Environnement de validation (`staging`) alimenté par des données anonymisées. |
| **Fumage (smoke test)** | Vérification rapide des parcours critiques après un déploiement. |
| **Palier** | Niveau d'abonnement déterminant quotas et accès. |
| **DoR / DoD** | Definition of Ready / Definition of Done (§1.1, §1.2). |

---

## 3. Exigences transverses (toutes phases)

### EX-T01 — Ordre de construction forcé
**Source :** §0.2, R3 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que direction technique, je veux que chaque couche soit terminée avant que la suivante ne démarre, afin qu'aucun module ne reste à moitié fait.

1. LE Système DOIT être construit dans l'ordre Infrastructure → Base de données → Domaine → API → Contrats partagés → Interface → Fonctionnalité.
2. AUCUN écran NE DOIT être développé tant que l'endpoint qu'il consomme n'existe pas et n'est pas testé.
3. UN lot NE DOIT démarrer que lorsque ses dépendances du §9 sont mergées dans `develop`.
4. LA branche `main` DOIT être déployable et fonctionnelle à tout instant.

### EX-T02 — Une branche, un module, une PR
**Source :** R1, §2.3 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. CHAQUE lot DOIT être livré par une branche nommée selon la convention §2.3 (`feat/<phase>-<module>-<description>`, etc.).
2. UNE PR NE DOIT PAS dépasser 800 lignes modifiées hors fichiers générés ; au-delà, elle DOIT être découpée.
3. LES commits DOIVENT suivre Conventional Commits, vérifiés par `commitlint`.
4. LE merge dans `develop` DOIT se faire en squash ; la branche DOIT être supprimée après merge.
5. AUCUN commit direct ni force push NE DOIT être possible sur `main` ou `develop` (protection de branche).
6. UNE branche NE DOIT PAS vivre plus de 5 jours ouvrés sans rebase sur `develop`.

### EX-T03 — CI toujours verte
**Source :** R2, §10.2 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. AUCUN merge NE DOIT être possible si un contrôle de CI échoue.
2. LA CI DOIT exécuter : lint, format, commitlint, typecheck strict, tests unitaires avec seuils, tests d'intégration Testcontainers, build, gitleaks, `npm audit`, Trivy, CodeQL, vérification des migrations `up` puis `down`, environnement de prévisualisation, E2E Playwright.
3. LES contrôles de sécurité DOIVENT bloquer sur toute vulnérabilité de criticité haute ou critique.

### EX-T04 — Le serveur, seule source de vérité
**Source :** R4, §7.1, §7.7 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que porteur produit, je veux que le badge vérifié ne puisse pas être obtenu en manipulant le navigateur, afin que la confiance dans OZ soit fondée.

1. TOUTE validation côté client DOIT être rejouée intégralement côté serveur.
2. CHAQUE ressource DOIT avoir un schéma Zod unique dans `packages/contracts`, importé par le formulaire et par le contrôleur.
3. LE pipe de validation DOIT rejeter en 422 toute entrée non conforme, avant toute logique métier, et supprimer tout champ inconnu (`strict()`).
4. UN test de contrat DOIT échouer si un champ existe dans le schéma sans exister dans le formulaire.
5. AUCUNE décision d'autorisation NE DOIT dépendre d'une valeur transmise par le client (rôle, âge, niveau KYC, palier) ; tout DOIT être relu en base à chaque requête.
6. AUCUNE donnée faisant preuve NE DOIT utiliser l'horodatage du client.
7. AUCUN compte NE DOIT pouvoir modifier son propre niveau KYC, son propre rôle ou son propre statut de vérification.
8. AUCUNE donnée NE DOIT être affichée comme « vérifiée » avant que la transition d'état ne soit écrite en base et journalisée.

### EX-T05 — Zéro dette reportée
**Source :** R5 · **Priorité :** P0 · **Statut :** Plan

1. UNE PR contenant un `TODO`, `FIXME` ou `any` TypeScript non justifié DOIT être bloquée.
2. TOUTE dette acceptée DOIT être consignée dans `DEBT.md` avec une échéance ferme et un responsable nommé.

### EX-T06 — Couverture de tests
**Source :** R6 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. LA CI DOIT bloquer sous 80 % de couverture sur les couches domaine et services.
2. LA CI DOIT bloquer sous 70 % de couverture globale.
3. LA CI DOIT bloquer sous 100 % de couverture sur les modules d'authentification, de KYC et de facturation.

### EX-T07 — Endpoints documentés
**Source :** R7 · **Priorité :** P0 · **Statut :** Plan

1. CHAQUE endpoint DOIT figurer dans un schéma OpenAPI généré automatiquement, avec exemples de requête et de réponse.
2. LES codes d'erreur DOIVENT suivre un format normalisé unique.
3. UN endpoint absent de l'OpenAPI DOIT être considéré comme inexistant (revue refusée).

### EX-T08 — Aucun secret dans le dépôt
**Source :** R8, §6.9 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. `gitleaks` DOIT s'exécuter en pre-commit et en CI, et bloquer toute détection.
2. LES secrets DOIVENT résider dans le gestionnaire de secrets de l'environnement (ou Infisical), jamais dans un `.env` versionné.
3. LES secrets DOIVENT être tournés trimestriellement.
4. LES secrets JWT NE DOIVENT JAMAIS être réutilisés entre environnements.

### EX-T09 — Migrations réversibles
**Source :** R9 · **Priorité :** P0 · **Statut :** Plan

1. CHAQUE migration DOIT fournir un `up` et un `down`.
2. CHAQUE migration DOIT être testée en CI en `up` puis `down`.
3. CHAQUE migration DOIT être testée sur une copie de la base de recette avant application en production.

### EX-T10 — Aucune donnée réelle hors production
**Source :** R10, §10.1 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. LES environnements local et prévisualisation DOIVENT utiliser exclusivement des données synthétiques.
2. LA recette DOIT utiliser exclusivement des données anonymisées par un script versionné et testé.
3. LE script d'anonymisation DOIT avoir un test prouvant qu'aucun nom, date de naissance exacte, téléphone, email ou numéro de document réel ne subsiste.

### EX-T11 — Journal d'audit immuable
**Source :** R11, §5.4, §6.4 A08 · **Priorité :** P0 · **Statut :** Plan · n° 2 à 5 livrés (lots 1.1a et 1.16a, `docs/security/audit.md`) ; n° 1 au fil des lots métier

1. LE Système DOIT journaliser : création de compte, transition d'état KYC, certification de performance, changement de rôle, accès à un dossier de mineur, opération de facturation, décision d'administration.
2. CHAQUE entrée DOIT contenir l'acteur, l'action, la cible, le motif, l'horodatage serveur, le `requestId` et le hash de l'entrée précédente.
3. TOUTE altération rétroactive DOIT être détectable par une vérification de la chaîne de hash.
4. LA table `audit_log` DOIT être partitionnée mensuellement.
5. AUCUN rôle applicatif NE DOIT disposer des droits `UPDATE` ou `DELETE` sur `audit_log`.

### EX-T12 — Dépendances auditées
**Source :** R12 · **Priorité :** P0 · **Statut :** Plan

1. TOUTE nouvelle dépendance DOIT être consignée dans `DEPENDENCIES.md` avec : licence, résultat d'audit de vulnérabilités, poids, alternative native envisagée.
2. UNE PR ajoutant une dépendance non consignée DOIT être refusée.

### EX-T13 — Feature flags
**Source :** R13, §13.2 · **Priorité :** P1 · **Statut :** Plan

1. TOUTE fonctionnalité non triviale DOIT être livrée derrière un drapeau désactivé en production par défaut.
2. UN drapeau DOIT pouvoir être activé pour un échantillon d'utilisateurs avant généralisation.
3. CHAQUE drapeau activé DOIT être associé à une mesure d'adoption, de complétion ou de taux de vérification.

### EX-T14 — Revue et approbation (adaptation de R14)
**Source :** R14, D-K06 · **Priorité :** P0 · **Statut :** Adaptation validée au kickoff [BLOQUANT]

**Récit :** En tant que Gaëtan Wassu, seul humain du projet, je veux qu'aucun code ne soit mergé sans une revue indépendante et mon approbation, afin que la règle des deux paires d'yeux reste réelle.

1. CHAQUE PR DOIT passer la revue adversariale de `/execute-phase` (sous-agent indépendant qui ne fait pas confiance à l'auto-évaluation de l'implémenteur).
2. LA revue DOIT porter explicitement sur : sécurité, tests, performance, lisibilité.
3. AUCUN merge NE DOIT avoir lieu sans l'approbation explicite de Gaëtan Wassu dans la conversation ou sur la PR.
4. AUCUN `git push` ni merge NE DOIT être exécuté par Claude sans confirmation préalable.
5. LES chaînes de travail A et B du §9 PEUVENT être menées en parallèle dans des sessions distinctes, chacune sur sa propre branche ; toute modification de `packages/contracts` DOIT être annoncée avant d'être poussée.

### EX-T15 — Definition of Ready et Definition of Done
**Source :** §1.1, §1.2 · **Priorité :** P0 · **Statut :** Plan

1. UN lot NE DOIT démarrer que si sa DoR est satisfaite : périmètre validé par le porteur produit, dépendances mergées, contrat d'API rédigé, modèle de données identifié, cas d'erreur listés, critères d'acceptation chiffrés.
2. UN lot NE DOIT être clos que si sa DoD est satisfaite : PR approuvée, tests verts et seuils atteints, E2E du parcours principal vert, OpenAPI à jour, migration testée, aucune vulnérabilité haute, journalisation en place, test « rôle non autorisé », fumé en recette, `CHANGELOG.md` mis à jour, documentation à jour si le lot est visible.

### EX-T16 — Protection des mineurs
**Source :** §6.7, §7.3 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que tuteur légal, je veux que le profil de mon enfant ne soit jamais exposé sans mon accord ni accessible à un recruteur non vérifié, afin de le protéger contre les fausses promesses et la traite.

1. LE Système DOIT calculer la minorité à partir de la date de naissance à chaque requête, sans jamais la mettre en cache dans un jeton.
2. AUCUN profil de mineur NE DOIT être accessible anonymement ni indexé par un moteur de recherche (`noindex` forcé, exclusion du sitemap).
3. UN profil de mineur NE DOIT être publiable qu'après consentement horodaté et documenté d'un tuteur vérifié en KYC 2.
4. LES coordonnées directes d'un mineur NE DOIVENT être envoyées à aucun rôle tiers, à aucun palier : seuls le tuteur de l'enfant et l'administrateur, journalisé, y accèdent (CP-11, décision D6 du lot 1.4a) ; le contact passe par l'organisation de rattachement ou le tuteur.
5. TOUTE consultation d'un profil de mineur par un recruteur ou une agence DOIT être journalisée avec l'identité du consultant, et visible par le tuteur.
6. UN recruteur ou une agence non vérifié(e) KYC 3 NE DOIT avoir accès à aucun profil de mineur, quel que soit son abonnement.
7. LE Système NE DOIT collecter ni données de santé, ni données scolaires, ni géolocalisation précise.
8. UN bouton de signalement DOIT être présent sur chaque profil et chaque échange ; chaque signalement DOIT être traité sous 48 h.
9. AUCUNE décision automatique irrévocable NE DOIT être prise sur un mineur (KYC, scoring, fraude).

### EX-T17 — Sécurité applicative
**Source :** §6.4, §6.5, §6.9 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT servir exclusivement en TLS 1.3 avec HSTS preload.
2. LE Système DOIT émettre les en-têtes du §6.5 : CSP stricte avec nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
3. LE CORS DOIT fonctionner en liste blanche.
4. LES images Docker DOIVENT être minimales et s'exécuter en non-root.
5. AUCUNE requête SQL NE DOIT être construite par concaténation ; tout accès passe par Prisma paramétré.
6. AUCUNE URL fournie par un utilisateur NE DOIT être récupérée côté serveur sans liste blanche (SSRF).
7. LES champs d'identité sensibles (numéro de document, données du tuteur) DOIVENT être chiffrés au niveau colonne (`pgcrypto`).

### EX-T18 — Limitation de débit
**Source :** §6.6 · **Priorité :** P0 · **Statut :** Plan (valeurs de départ ajustables)

1. LE Système DOIT appliquer les limites de départ : `POST /auth/login` 5 / 15 min / IP et 10 / h / compte ; `POST /auth/register` 3 / h / IP et 1 / email ; `POST /kyc/submit` 3 / jour / utilisateur ; `GET /search` 60 / min authentifié plus quota journalier par palier ; `POST /documents/upload` 20 / h / utilisateur et 50 Mo / fichier ; 1000 / min / IP au niveau Cloudflare.
2. UN dépassement DOIT renvoyer 429 avec un en-tête `Retry-After`.
3. LES limites DOIVENT être configurables sans redéploiement.

### EX-T19 — Journalisation et confidentialité des logs
**Source :** §12.1, §6.4 A09 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. LES logs DOIVENT être en JSON structuré, avec un `requestId` propagé de bout en bout (web, API, workers).
2. AUCUNE donnée personnelle NE DOIT apparaître en clair dans un log.
3. LES logs DOIVENT être conservés 12 mois.

### EX-T20 — Scalabilité dès le premier jour
**Source :** §3.1, §3.6 · **Priorité :** P0 · **Statut :** Plan

1. L'API DOIT être sans état ; les sessions DOIVENT résider dans Redis.
2. TOUTE liste DOIT être paginée par curseur, jamais par `OFFSET`.
3. TOUT traitement de plus de 500 ms DOIT passer par une file BullMQ.
4. LES identifiants techniques DOIVENT être des UUIDv7 ; aucun entier séquentiel ne DOIT être exposé.
5. AUCUNE requête NE DOIT utiliser `SELECT *` ou `COUNT(*)` non borné sur une table de profils.
6. L'accès à la base DOIT passer par un `DatabaseService` capable de router lecture et écriture (activation en Phase 3).
7. LES médias DOIVENT être servis derrière un CDN.

### EX-T21 — Multi-pays et multilingue structurels
**Source :** §3.1, lot 0.4 · **Priorité :** P0 · **Statut :** Plan

1. LE schéma NE DOIT contenir aucun champ géographique codé en dur ; pays (ISO 3166-1), région et ville DOIVENT être des données.
2. TOUS les horodatages DOIVENT être stockés en UTC (`timestamptz`).
3. TOUTE chaîne d'interface DOIT passer par le système i18n ; le français est la langue par défaut, l'anglais est préparé dès la Phase 0.

### EX-T22 — Accessibilité et connexion faible
**Source :** lot 1.5, §12.3 · **Priorité :** P0 · **Statut :** Plan

1. TOUS les parcours publics DOIVENT respecter WCAG 2.1 niveau AA (axe-core en continu).
2. L'interface DOIT être utilisable à partir de 320 px de large.
3. LE p95 de chargement de page DOIT rester sous 2,5 s en 3G simulée.

### EX-T23 — Sauvegardes et reprise
**Source :** §6.9, §10.4 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. PostgreSQL DOIT être sauvegardé par snapshot quotidien et WAL continu, avec une rétention de 30 jours.
2. LE stockage objets DOIT être versionné et répliqué.
3. UNE restauration DOIT être testée chaque mois et consignée dans un runbook.
4. LES objectifs de reprise de Phase 1 sont RTO 4 h et RPO 15 min ; ils DOIVENT être durcis en Phase 3.
5. CHAQUE scénario du §10.4 DOIT disposer d'un runbook exécutable par une personne qui n'a pas conçu le système.

### EX-T24 — Conformité réglementaire
**Source :** §6.8 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT respecter la loi camerounaise n° 2010/012, le cadre camerounais de protection des données, le RGPD, la Loi 25 (Québec) et l'art. 19 RSTJ de la FIFA.
2. UN registre des traitements DOIT être tenu à jour.
3. LA politique de confidentialité et les CGU DOIVENT être publiées avant l'ouverture des inscriptions [BLOQUANT].
4. UN accord de sous-traitance (DPA) DOIT exister avec chaque prestataire traitant des données personnelles.
5. UNE procédure de notification d'incident sous 72 h DOIT être écrite et testée.
6. LA vérification d'identité traitant des données biométriques (RGPD art. 9), y compris de mineurs, UNE analyse d'impact (AIPD) DOIT être réalisée et validée avant le lot 1.10, et un consentement explicite (du tuteur pour un mineur) DOIT être recueilli avant toute capture de selfie (TD-015).

---

## 4. Exigences par phase

## PHASE 0 — FONDATIONS

*Objectif : qu'aucune ligne de code métier ne soit écrite sur du sable (§8, Phase 0).*

### EX-001 — Monorepo et outillage qualité
**Source :** lot 0.1, §3.3 · **Priorité :** P0 · **Statut :** Plan

**Récit :** En tant que développeur, je veux un monorepo outillé et reproductible, afin qu'un poste vierge puisse construire et tester le projet sans configuration manuelle.

1. LE dépôt DOIT suivre l'arborescence du §3.3 (`apps/web`, `apps/admin`, `apps/api`, `apps/worker`, `packages/{contracts,db,ui,core,auth,config,testing}`, `infra/`, `docs/`).
2. LE dépôt DOIT utiliser pnpm 9+ en workspaces et Turborepo 2+.
3. TypeScript DOIT être en mode `strict` dans tous les paquets.
4. ESLint, Prettier, Husky, lint-staged, commitlint et gitleaks DOIVENT être configurés et actifs en pre-commit.
5. `pnpm install && pnpm build && pnpm lint && pnpm test` DOIT réussir sur un poste vierge.

### EX-002 — Environnement de développement conteneurisé
**Source :** lot 0.2 · **Priorité :** P0 · **Statut :** Plan

1. UN seul `docker compose up` DOIT lever PostgreSQL 16, Redis 7, MinIO, ClamAV et Mailpit.
2. LES versions des services DOIVENT être identiques à celles de la recette et de la production.

### EX-003 — Squelette d'API
**Source :** lot 0.3 · **Priorité :** P0 · **Statut :** Plan

1. L'API NestJS DOIT charger une configuration typée et validée au démarrage ; une variable manquante DOIT empêcher le démarrage.
2. UN filtre d'exceptions global DOIT produire un format d'erreur normalisé unique (code, message, `requestId`, détails de validation).
3. `/health` DOIT répondre l'état de l'API et de ses dépendances (base, Redis, stockage).
4. `/docs` DOIT exposer l'interface Swagger en local et en recette uniquement.

### EX-004 — Squelette web
**Source :** lot 0.4 · **Priorité :** P0 · **Statut :** Plan

1. L'application web DOIT utiliser Next.js 15 App Router, Tailwind et des tokens de design.
2. L'i18n DOIT être en place, français par défaut, anglais préparé.
3. LA page d'accueil DOIT être déployée en recette.

### EX-005 — Contrats partagés
**Source :** lot 0.5, §3.3, §7.1 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. `packages/contracts` DOIT définir les conventions de nommage et d'organisation des schémas.
2. UN premier schéma DOIT valider simultanément un formulaire web et un endpoint API.
3. UN `ZodValidationPipe` DOIT être disponible pour tous les contrôleurs.
4. DES tests de contrat DOIVENT détecter toute divergence entre formulaire et schéma.

### EX-006 — Base de données initiale
**Source :** lot 0.6 · **Priorité :** P0 · **Statut :** Plan

1. `packages/db` DOIT contenir le schéma Prisma initial et une première migration réversible.
2. DES seeds synthétiques déterministes DOIVENT être fournis.
3. LE script d'anonymisation DOIT exister et être testé (EX-T10).

### EX-007 — Intégration continue
**Source :** lot 0.7, §10.2 · **Priorité :** P0 · **Statut :** Plan

1. GitHub Actions DOIT exécuter tous les contrôles listés en EX-T03.
2. UNE PR DOIT être bloquée si un seul contrôle échoue.
3. LE cache pnpm et Turborepo DOIT être utilisé pour accélérer la CI.

### EX-008 — Environnements et déploiement
**Source :** lot 0.8, §10.1 · **Priorité :** P0 · **Statut :** Plan

1. LES quatre environnements (local, prévisualisation par PR, recette, production) DOIVENT exister.
2. CHAQUE PR DOIT produire un environnement de prévisualisation détruit au merge.
3. UN merge sur `develop` DOIT déployer automatiquement en recette, appliquer les migrations et lancer le fumage.
4. LA recette DOIT être protégée par mot de passe.
5. LES domaines, TLS, Cloudflare (DNS, CDN, WAF) et secrets DOIVENT être configurés.
6. L'hébergement de Phases 1-2 est un VPS Hetzner ou OVH avec Coolify ; la région de données est l'Europe (ADR-003).

### EX-009 — Observabilité de base
**Source :** lot 0.9, §12 · **Priorité :** P0 · **Statut :** Plan

1. Sentry DOIT être branché sur le web, l'API et les workers.
2. UNE erreur provoquée DOIT remonter dans Sentry avec sa trace et son `requestId`.
3. DES sondes de disponibilité externes DOIVENT surveiller la page d'accueil et `/health`.

### EX-010 — Design system initial
**Source :** lot 0.10 · **Priorité :** P0 · **Statut :** Plan

1. Storybook 8 DOIT être déployé.
2. HUIT composants de base DOIVENT y être documentés : bouton, champ, sélecteur, carte, badge, tableau, modale, notification.

### EX-011 — Documentation fondatrice
**Source :** lot 0.11, §4.3, §15 · **Priorité :** P0 · **Statut :** Plan

1. LES ADR 001 à 008 du §4.3 DOIVENT être rédigés selon le modèle de l'Annexe A et mergés.
2. `CONTRIBUTING.md`, `SECURITY.md` et le modèle de PR (Annexe B) DOIVENT être mergés.
3. LA politique de sécurité (`docs/security/policy.md`) et le modèle de menaces (`docs/security/threats.md`) DOIVENT être mergés avant la fin de la Phase 0.
4. LE plan d'exécution DOIT être versionné dans `docs/PLAN.md`.

**[JALON J1] — Critère de sortie de la Phase 0 :** une modification poussée sur une branche déclenche la CI, produit une prévisualisation et se déploie en recette après merge. Aucune ligne de code métier n'existe encore.

---

## PHASE 1 — WEB PUBLIC, INSCRIPTIONS ET CHARGEMENT DES DONNÉES

*La phase commandée : à sa fin, OZ existe publiquement, les inscriptions sont ouvertes, les données des inscrits sont chargées, vérifiées et exploitables (§0.4).*

### EX-101 — Modèle de données du socle
**Source :** lot 1.1, §5 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT créer les tables `users`, `user_roles`, `sessions`, `players`, `organizations`, `guardians`, `documents`, `kyc_cases`, `consents`, `audit_log`, `notifications`, `imports`, `subscriptions`.
2. CHAQUE table DOIT avoir un `id` UUIDv7, `created_at`, `updated_at` et `deleted_at` en `timestamptz` UTC ; les tables sensibles DOIVENT avoir `created_by` et `updated_by`.
3. LA Row Level Security DOIT être activée sur chaque table exposée à un rôle externe.
4. DES contraintes `CHECK` DOIVENT garantir l'intégrité : âge (`birth_date <= CURRENT_DATE - INTERVAL '6 years'`), formats, énumérations.
5. AUCUNE suppression physique NE DOIT être possible sur les données de personnes ; seules l'anonymisation et la suppression logique sont autorisées.
6. LES index de recherche (`search_vector`, GIN, `pg_trgm`, `unaccent`) DOIVENT être préparés.
7. LA migration DOIT être réversible et testée ; un diagramme entités-relations DOIT être généré dans `docs/data/`.
8. DES seeds de 500 profils synthétiques DOIVENT être fournis.

### EX-102 — Générateur et registre OZ ID
**Source :** lot 1.2, §5.3 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que joueur, je veux un identifiant que je peux dicter au téléphone et montrer sur le terrain, afin que tout club retrouve mon profil sans erreur.

1. L'OZ ID DOIT suivre le format `OZ-<pays ISO alpha-2>-<année sur 2 chiffres>-<6 caractères base32 Crockford>-<checksum>`.
2. LA partie aléatoire NE DOIT PAS contenir les caractères I, L, O, U.
3. L'OZ ID NE DOIT PAS être séquentiel ni révéler le nombre d'inscrits.
4. LE checksum DOIT être calculé par l'algorithme de Damm sur l'alphabet base 32 Crockford, sur l'identifiant entier (TD-017) ; il DOIT détecter 100 % des erreurs sur un caractère et 100 % des inversions de deux caractères voisins, et être vérifiable hors ligne par une fonction de `packages/core`.
5. L'unicité DOIT être garantie sous concurrence par réservation atomique.
6. UN OZ ID NE DOIT JAMAIS être modifié ni réattribué, même après suppression du compte.
7. UN QR code du profil DOIT être généré à partir de l'OZ ID.
8. UN test DOIT générer 1 000 000 d'identifiants sans collision ; la validation du checksum DOIT être couverte à 100 %.

### EX-103 — Authentification et sessions
**Source :** lot 1.3, §6.2 · **Priorité :** P0 · **Statut :** Plan

**Récit :** En tant qu'utilisateur, je veux un compte sûr dont je contrôle les sessions, afin que personne ne puisse usurper mon identité vérifiée.

1. LE Système DOIT permettre inscription, connexion, déconnexion, déconnexion globale, confirmation d'email et réinitialisation de mot de passe.
2. LES mots de passe DOIVENT être hachés en Argon2id (m=19456, t=2, p=1), d'au moins 12 caractères, vérifiés contre HaveIBeenPwned par k-anonymité, sans règle de composition arbitraire.
3. LE jeton d'accès JWT DOIT durer 15 min et être conservé en mémoire côté client.
4. LE jeton de rafraîchissement DOIT être en cookie `httpOnly`, `Secure`, `SameSite=Strict`, tourné à chaque usage.
5. LA réutilisation d'un jeton de rafraîchissement déjà consommé DOIT révoquer toute la famille de jetons.
6. L'utilisateur DOIT pouvoir lister et révoquer ses sessions actives (appareil, IP tronquée, date).
7. LA 2FA TOTP DOIT être obligatoire pour administrateurs OZ, centres et fédérations, et optionnelle pour les autres.
8. LES échecs de connexion DOIVENT déclencher un délai exponentiel, jamais un verrouillage définitif.
9. LA vérification d'email DOIT être obligatoire avant toute action.
10. LES messages d'erreur NE DOIVENT PAS révéler l'existence d'un compte.
11. reCAPTCHA v3, un champ piège et la chronométrie de remplissage DOIVENT protéger l'inscription.
12. LE module DOIT être couvert à 100 % ; un scénario Playwright complet et un test de non-régression sur la réutilisation de jeton DOIVENT exister.

### EX-104 — Rôles, permissions et cloisonnement
**Source :** lot 1.4, §3.5, §6.3 · **Priorité :** P0 · **Statut :** Codé — matrice tranchée le 2026-11-02 (`docs/security/rbac.md`), CASL (lot 1.4a), RLS alignée et vues (lot 1.4b) ; déploiement en recette (§0.2) à vérifier, routes métier à leurs lots

**Récit :** En tant que porteur produit, je veux que chaque rôle ne voie que ce qu'il a le droit de voir, afin que la base d'identité ne fuie jamais.

1. LE Système DOIT gérer 7 rôles d'inscription (joueur, tuteur, académie, club, fédération, centre, recruteur — l'agence étant une variante de recruteur) et le rôle interne administrateur OZ.
2. LES droits DOIVENT être implémentés par trois couches cumulées : RLS PostgreSQL, politiques CASL, sérialisation par vue.
3. UN champ non autorisé NE DOIT PAS être masqué côté client : il NE DOIT PAS être envoyé.
4. LES décorateurs `@Roles` et `@Scope` DOIVENT être disponibles pour tous les contrôleurs.
5. LA politique par défaut DOIT être le refus.
6. CHAQUE endpoint DOIT avoir un test vérifiant qu'un rôle non autorisé reçoit 403 et non 200 avec des données filtrées [BLOQUANT].
7. UNE suite de tests DOIT couvrir chaque couple (rôle, endpoint) de la matrice ci-dessous.
8. LA matrice DOIT être documentée dans `docs/security/rbac.md`.

**Socle de référence — Annexe B du Document de Projet** (✓ accès · — pas d'accès · (limité) accès restreint) :

| Rôle | Gérer des joueurs | Rechercher | Saisir / certifier des tests | Valider / superviser |
|---|---|---|---|---|
| Joueur | Son profil | — | — | — |
| Académie | ✓ | (limité) | — | — |
| Club | ✓ | ✓ | — | — |
| Fédération | (consultation) | ✓ | — | (accès) |
| Centre OZ Performance | — | — | ✓ | — |
| Scout / Recruteur | — | ✓ | — | — |
| Administrateur OZ | ✓ | ✓ | — | ✓ |

**Matrice détaillée dérivée** — conforme à l'Annexe B, étendue au tuteur et aux règles mineurs du plan ; les cellules marquées * étaient des déductions, tranchées le 2026-11-02 (décisions D1 à D7 du lot 1.4a) ; la matrice qui fait foi est `docs/security/rbac.md` :

| Action | Joueur | Tuteur* | Académie | Club | Fédération | Centre | Recruteur / Agence (KYC 3) | Admin OZ |
|---|---|---|---|---|---|---|---|---|
| Voir son propre profil complet | ✓ | ✓ (enfant) | — | — | — | — | — | ✓ |
| Modifier son profil (hors KYC, rôle, statut) | ✓ majeur | ✓ (enfant) | ✓ joueurs rattachés, champs déclaratifs | ✓ effectif, champs déclaratifs | — | — | — | ✓ motivé, journalisé |
| Créer des joueurs / importer | — | — | ✓ | ✓ | — | — | — | ✓ |
| Voir profil majeur vérifié (champs publics) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rechercher des joueurs | — | — | (limité)* : profils vérifiés, sans export ni critères avancés | ✓ | ✓ | — | ✓ | ✓ |
| Voir coordonnées du club / de l'académie d'un joueur (DP §16.2) | — | — | Selon palier* | Selon palier* | ✓ | — | Selon palier* | ✓ |
| Voir profil mineur | Soi-même | ✓ (enfant) | Rattachés + recherche limitée* | ✓ | ✓ (consultation) | Joueurs testés | ✓ si KYC 3, journalisé | ✓ journalisé |
| Voir coordonnées directes d'un mineur | — | ✓ (enfant) | — | — | — | — | **Jamais** | ✓ journalisé |
| Créer des listes / shortlists (DP §16.1) | — | — | ✓ | ✓ | ✓ | — | ✓ | — |
| Saisir / certifier des tests (Phase 2) | — | — | — | — | — | ✓ (2FA) | — | Revue |
| Décider un dossier KYC, valider comptes | — | — | — | — | (accès)* : appui licences | — | — | ✓ (quatre yeux si requis) |
| Consulter le journal d'audit | Ses accès subis | Accès à l'enfant | — | — | — | — | — | ✓ |
| Gérer abonnements, sauvegardes (DP §8.7) | — | — | Le sien | Le sien | Le sien | Le sien | Le sien | ✓ |

### EX-105 — Design system et coquille applicative
**Source :** lot 1.5 · **Priorité :** P0 · **Statut :** Fait (Lighthouse en recette, D-129) — n° 1 fait (lot 1.5a, [ADR-009](docs/adr/ADR-009-identite-visuelle.md) : charte OZ Football ID, clair et sombre) ; n° 2 : jetons, typographie et logo (1.5a), composants de formulaire, de pilotage et de chargement du §8.6 (lot 1.5ba) ; coquille, navigation par rôle, états d'erreur et de chargement, effets d'émotion et audit (lot 1.5bb) — Lighthouse à passer en recette (D-129)

1. L'identité visuelle DOIT faire converger les deux univers du DP §12.2 (doré / vert, sur fond sombre) en un système unique à deux registres, selon la direction de `design.md` §8, et la décision DOIT être consignée en ADR.
2. LE design system DOIT fournir tokens, thème sombre, typographie, grille, composants de formulaire, états de chargement et d'erreur.
3. L'interface DOIT respecter EX-T22 (AA, 320 px, 3G).
4. Lighthouse DOIT donner au moins 90 en accessibilité et en bonnes pratiques.
5. Storybook DOIT documenter l'ensemble des composants.

### EX-106 — Site public et pages légales
**Source :** lot 1.6 · **Priorité :** P0 · **Statut :** Fait (lot 1.6 ; n° 4 mesuré en LCP 3G, Lighthouse en recette, D-129 ; textes provisoires, D-128)

1. LE site DOIT présenter : accueil, page par profil (joueur, tuteur, académie, club, fédération, centre, recruteur), tarifs, à propos, contact, mentions légales, politique de confidentialité, CGU.
2. LES pages publiques DOIVENT avoir métadonnées SEO et sociales, et un sitemap.
3. `robots.txt` DOIT interdire l'indexation de tout profil.
4. Lighthouse performance DOIT être d'au moins 85 sur mobile.
5. LES pages légales DOIVENT être publiées avant l'ouverture des inscriptions [BLOQUANT].

### EX-107 — Inscription joueur et attribution de l'OZ ID
**Source :** lot 1.7 · **Priorité :** P0 · **Statut :** En cours (1.7a serveur fait : n° 2, 3 C2 et C4, 4, 5, 6 ; 1.7ca : étape compte du n° 1 et session du site, ADR-010 ; parcours, n° 1, 7 et 8 au lot 1.7cb ; photo, D-131)

**Récit :** En tant que jeune joueur avec une connexion instable, je veux m'inscrire en plusieurs fois sans perdre ce que j'ai saisi, afin d'obtenir mon OZ ID.

1. LE parcours DOIT comporter les étapes : compte → identité → caractéristiques sportives → rattachement → tuteur si mineur → photo.
2. LA progression DOIT être sauvegardée côté serveur à chaque étape et reprise après interruption.
3. LA date de naissance DOIT être bornée entre 6 et 45 ans à chaque couche (C1 à C4, §7.2).
4. LA détection de minorité DOIT faire apparaître le bloc tuteur, obligatoire et bloquant.
5. CHAQUE étape DOIT être validée par le schéma partagé de `packages/contracts`.
6. L'OZ ID DOIT être attribué à la validation finale, en statut `DECLARED`.
7. LE formulaire DOIT fonctionner sur connexion 3G simulée.
8. LES tests E2E DOIVENT couvrir le cas majeur, le cas mineur et la reprise après interruption.

### EX-108 — Inscription et vérification du tuteur légal
**Source :** §6.7, §7.3, D-K03 · **Priorité :** P0 · **Statut :** [À CONFIRMER] — le plan exige un tuteur vérifié KYC 2 sans décrire son parcours

**Récit :** En tant que parent, je veux créer mon propre compte et me faire vérifier, afin d'autoriser la publication du profil de mon enfant et de garder la main sur qui le consulte.

1. LE tuteur DOIT pouvoir être invité par le joueur mineur (lien ou email/SMS) ou s'inscrire directement.
2. LE tuteur DOIT déclarer son lien avec l'enfant et fournir un justificatif de lien (acte de naissance ou jugement de tutelle).
3. LE tuteur DOIT atteindre le KYC 2 avant que son consentement ne soit valide.
4. LE consentement DOIT être horodaté côté serveur, versionné (texte consenti conservé) et révocable.
5. LA révocation du consentement DOIT dépublier immédiatement le profil de l'enfant.
6. UN tuteur DOIT pouvoir être rattaché à plusieurs enfants.
7. LES données du tuteur DOIVENT être chiffrées au niveau colonne.

### EX-109 — Inscription organisation
**Source :** lot 1.8, D-K04, D-K05 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT proposer 6 types d'organisation avec formulaires différenciés : académie, club, fédération, centre OZ Performance, recruteur, agence de joueurs.
2. L'agence DOIT suivre le parcours du recruteur, avec la licence d'agent comme justificatif KYC 3.
3. CHAQUE organisation DOIT rattacher un dirigeant et fournir les justificatifs de son type (registre, statuts, licence, mandat, convention).
4. LE dirigeant DOIT pouvoir inviter des membres avec un rôle interne.
5. UN compte de chaque type DOIT être créé et validé de bout en bout en recette.

### EX-110 — Téléversement et coffre documentaire
**Source :** lot 1.9, §7.4 (étapes 1-3) · **Priorité :** P0 · **Statut :** Codé — lot 1.9a : n° 1 ; n° 2 pour la signature, le type réel et la taille ; n° 7 pour `retention_until` ; lot 1.9b : n° 2 (dimensions, pages), n° 3 (SHA-256 recalculée et comparée, doublon signalé sans rejet), n° 4, n° 5, n° 8 pour EICAR et l'image piégée (`apps/worker/test/document-pipeline.int.test.ts`) ; lot 1.9ca : n° 6 (URL GET signée de 5 minutes, pièce saine seulement, `apps/api/test/document-read.int.test.ts`) et n° 8 « aucune URL sans signature valide » (CP-21, CP-22 sur SeaweedFS) ; lot 1.9cb : n° 7 (purge programmée à `retention_until`, CP-20, `apps/worker/test/document-pipeline.int.test.ts`) et parcours E2E n° 10 (`e2e/documents/infected-upload.spec.ts`). Toutes les clauses sont couvertes ; production fermée tant que D-092 (reste), D-093 et D-097 demeurent

1. LE client DOIT envoyer les fichiers directement au stockage par URL signée ; l'API NE DOIT PAS transporter le binaire.
2. LE serveur DOIT vérifier la signature de téléversement, le type MIME réel (magic bytes), la taille, les dimensions et le nombre de pages ; l'extension NE DOIT JAMAIS être crue.
3. LE SHA-256 DOIT être calculé et comparé aux documents déjà soumis.
4. TOUT fichier DOIT être scanné par ClamAV avant d'être accessible ; un fichier infecté DOIT être rejeté et déclencher une alerte sécurité.
5. TOUTE image DOIT être ré-encodée pour détruire les charges utiles embarquées, et ses EXIF supprimés.
6. L'accès à un document DOIT se faire exclusivement par URL signée valable 5 minutes.
7. CHAQUE document DOIT porter une date `retention_until` et être purgé automatiquement à échéance.
8. LE fichier de test EICAR DOIT être rejeté ; une image piégée DOIT être neutralisée ; aucune URL NE DOIT être accessible sans signature valide.

### EX-111 — KYC niveaux 0 à 2 et double vérification
**Source :** lot 1.10, §7 · **Priorité :** P0 · **Statut :** Plan

**Récit :** En tant que recruteur, je veux que le badge « Profil vérifié » garantisse l'identité et l'âge du joueur, afin de ne plus être trompé par des dates de naissance falsifiées.

1. LE KYC 0 DOIT exiger la seule confirmation d'email.
2. LE KYC 1 DOIT exiger email et téléphone vérifiés par OTP SMS ; la vérification SMS DOIT précéder toute soumission KYC 2.
3. LE KYC 2 DOIT exiger un document officiel, un selfie avec détection de vivacité, la concordance faciale, le contrôle de doublon et la revue prévue par l'aiguillage.
4. LE traitement asynchrone DOIT enchaîner : antivirus, ré-encodage, contrôle qualité, OCR, concordance déclaratif/OCR (Levenshtein normalisée), détection de falsification, vivacité, concordance faciale, doublon perceptuel, score de risque 0-100.
5. L'OCR NE DOIT JAMAIS décider seul ; un écart avec le déclaratif DOIT escalader en revue humaine avec l'écart signalé, pas rejeter automatiquement.
6. L'aiguillage DOIT être (TD-016) : rejet automatique **uniquement** sur signal déterministe (infecté, MIME incohérent, document expiré, illisible selon seuils mesurés, âge hors bornes) ; **tout autre dossier en revue humaine au lancement** ; mineur, tuteur, recruteur, agence, centre → revue humaine à quatre yeux, toujours. L'approbation automatique des majeurs (score < 25, aucun signal fort) NE DOIT être activée que par le drapeau `kyc.autoApproveAdults`, après preuve mesurée de concordance et avec les garde-fous de TD-016.
7. LES seuils DOIVENT être configurables (`KYC_AUTO_APPROVE_THRESHOLD`, `KYC_AUTO_REJECT_THRESHOLD`).
8. LA machine à états du §5.4 DOIT être respectée ; aucune transition NE DOIT être implicite ; chaque transition DOIT être journalisée avec acteur et motif.
9. UN profil `VERIFIED` dont le document expire DOIT repasser en `PENDING` (revérification tous les 24 mois).
10. TROIS rejets DOIVENT bloquer la resoumission 30 jours et imposer une revue manuelle.
11. APRÈS approbation, le document brut DOIT être purgé selon `DOCUMENT_RETENTION_DAYS` ; seuls la décision, l'empreinte et les métadonnées sont conservés.
12. LE pipeline DOIT être exécuté sur 100 dossiers synthétiques incluant des fraudes préparées ; les mineurs DOIVENT tous partir en revue humaine.

### EX-112 — KYC 3 pour recruteurs, agences, centres et fédérations
**Source :** §7.3, §11.2 parcours 5, D-K04 · **Priorité :** P0 · **Statut :** [À CONFIRMER] — écart du plan

> **Écart relevé :** le lot 1.10 ne couvre que les niveaux 0 à 2, mais le §7.3 exige le KYC 3 pour les recruteurs, agences, centres et fédérations, et le parcours E2E n° 5 de Phase 1 suppose un recruteur KYC 3. Proposition : un KYC 3 organisationnel **à revue manuelle** dès la Phase 1, sans automatisation avancée.

1. LE KYC 3 DOIT exiger le KYC 2 du dirigeant ou de la personne, plus le justificatif propre au type : licence ou mandat de club (recruteur), licence d'agent (agence), convention signée (centre, fédération).
2. LA décision KYC 3 DOIT appliquer la règle des quatre yeux.
3. LES centres DOIVENT avoir la 2FA active avant l'octroi du KYC 3.
4. LE KYC 3 joueur (acte de naissance + confirmation fédération ou club) PEUT être reporté en Phase 2 [À CONFIRMER].

### EX-113 — Back-office d'administration
**Source :** lot 1.11, §7.4 (étape 5) · **Priorité :** P0 · **Statut :** Plan

**Récit :** En tant qu'administrateur OZ, je veux traiter un dossier KYC en moins de 90 secondes avec tous les écarts sous les yeux, afin de tenir le délai de 48 h.

1. LE back-office DOIT présenter une file de revue KYC priorisée (mineurs, ancienneté, score).
2. L'écran de décision DOIT afficher document, selfie, déclaratif, écarts surlignés et historique.
3. LA décision DOIT être motivée par un choix dans une liste normalisée.
4. POUR un mineur, un tuteur, un recruteur, une agence ou un centre, deux administrateurs distincts DOIVENT approuver [BLOQUANT] ; le second NE DOIT PAS pouvoir être le premier.
5. LE back-office DOIT permettre la gestion des comptes, des rôles, la suspension, la consultation du journal d'audit et un tableau de bord opérationnel.
6. L'accès au back-office DOIT exiger la 2FA.
7. UN administrateur DOIT traiter un dossier de bout en bout en moins de 90 secondes ; toute action DOIT être retrouvable dans le journal.
8. UN guide administrateur DOIT être rédigé (`docs/guides/admin.md`).

### EX-114 — Import de masse des inscrits
**Source :** lot 1.12 · **Priorité :** P0 · **Statut :** Plan

**Récit :** En tant qu'académie, je veux charger tous mes joueurs depuis mon fichier Excel en une fois, avec un rapport clair et la possibilité d'annuler, afin d'être présente sur OZ dès le premier jour.

1. LE Système DOIT accepter des fichiers CSV et Excel jusqu'à 10 000 lignes.
2. UN assistant DOIT permettre d'associer les colonnes du fichier aux champs OZ ; la correspondance DOIT être mémorisée par organisation.
3. LA passe 1 DOIT être à blanc : aucune écriture, rapport d'erreurs ligne par ligne.
4. LA passe 2 NE DOIT s'exécuter qu'après confirmation explicite.
5. LES doublons DOIVENT être détectés contre la base existante et à l'intérieur du fichier.
6. LE traitement DOIT être asynchrone, avec progression en temps réel.
7. CHAQUE ligne valide DOIT recevoir un OZ ID en statut `DECLARED`.
8. UN rapport final téléchargeable DOIT lister les lignes acceptées, rejetées avec motif, et les doublons fusionnés ou signalés.
9. TOUT import DOIT être annulable en une opération pendant 72 h, sans laisser de donnée orpheline.
10. DES photos DOIVENT pouvoir être importées par archive ZIP, appariées par nom de fichier.
11. CHAQUE profil importé DOIT conserver la référence de son import d'origine.
12. LES mineurs importés NE DOIVENT PAS être publiés tant que EX-T16 n'est pas satisfaite.
13. UN import de 10 000 lignes DOIT être traité en moins de 5 minutes.
14. UN guide utilisateur académie DOIT être rédigé (`docs/guides/academy.md`).

### EX-115 — Profil joueur et visibilité
**Source :** lot 1.13 · **Priorité :** P0 · **Statut :** En cours (lot 1.13a : n° 1 à 3 et 6 côté API ; lot 1.13b : n° 4 et 5 côté API, QR SVG et export PDF filigrané par vue ; écrans au lot 1.13c)

1. LA fiche joueur DOIT être complète et sérialisée différemment selon le rôle du consultant (EX-104).
2. LES badges de vérification DOIVENT être lisibles d'un coup d'œil et distinguer KYC 1, KYC 2 et KYC 3.
3. LE joueur majeur (ou le tuteur pour un mineur) DOIT pouvoir régler la visibilité de chaque bloc.
4. LE profil DOIT afficher son QR code.
5. UN export PDF filigrané du profil DOIT être disponible.
6. UN test d'inspection de payload DOIT prouver qu'aucun champ interdit n'est présent dans la réponse réseau, pour chacun des sept rôles.

### EX-116 — Recherche version 1
**Source :** lot 1.14 · **Priorité :** P0 · **Statut :** En cours (côté API : n° 1, 2, 5 et 6 au lot 1.14a, n° 3, 4 et 7 au lot 1.14b, quotas du palier gratuit à confirmer par Q8 ; écrans au lot 1.13c ; parcours n° 5 au lot 1.10)

1. LA recherche DOIT filtrer par pays, région, ville, âge, poste, pied fort, taille, poids, statut de vérification, organisation.
2. LES résultats DOIVENT être triables et paginés par curseur.
3. L'utilisateur DOIT pouvoir sauvegarder ses recherches.
4. L'export CSV DOIT être filigrané individuellement et soumis à quota.
5. LE p95 DOIT rester sous 300 ms sur 100 000 profils synthétiques.
6. LES mineurs NE DOIVENT JAMAIS apparaître pour un recruteur ou une agence non vérifié(e) KYC 3.
7. EN Phase 1, les quotas DOIVENT s'appliquer selon un palier gratuit par défaut ; les paliers payants arrivent avec EX-210 [À CONFIRMER].

### EX-117 — Notifications et emails transactionnels
**Source :** lot 1.15 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT émettre : confirmation d'email, OTP SMS, décision KYC, rapport d'import, invitation de membre, invitation de tuteur, alerte de nouvelle connexion.
2. L'utilisateur DOIT pouvoir régler ses préférences et se désinscrire des notifications non essentielles.
3. LES gabarits DOIVENT être des composants React Email testés sur les principaux clients.
4. SPF, DKIM et DMARC DOIVENT être configurés ; la délivrabilité DOIT être vérifiée.
5. LES envois DOIVENT passer par une file asynchrone.

### EX-118 — Journal d'audit et droits RGPD
**Source :** lot 1.16 · **Priorité :** P0 · **Statut :** Plan · n° 1 livré côté API (lot 1.16a ; écran au lot 1.11) ; n° 2 livré côté API et worker (lots 1.16ba et 1.16bb : inventaire, demande, archive JSON, URL signée, email, expiration ; écran au lot 1.11) ; n° 3 en cours (lot 1.16ca : demande, rétractation de 30 jours, annulation et anonymisation en base, prouvée sans donnée d'origine résiduelle ; lot 1.16cba : exécution à l'échéance par le worker, fichiers purgés, fiche masquée aux tiers pendant le délai, gel d'un compte suspendu, accès malgré la 2FA obligatoire ; lot 1.16cbb : demande du tuteur pour son enfant mineur, annulation à la majorité, E2E n° 9) ; n° 4 livré en brouillon (lot 1.16cbb : `docs/security/gdpr-register.md`, chaque table rattachée à un traitement, bases légales à confirmer)

1. LE journal d'audit DOIT respecter EX-T11 et être consultable dans le back-office.
2. UN utilisateur DOIT pouvoir obtenir l'export complet de ses données personnelles dans un format portable.
3. LA suppression de compte DOIT anonymiser toute donnée personnelle et conserver les agrégats anonymes ; l'OZ ID DOIT rester réservé.
4. LE registre des traitements DOIT être rédigé (`docs/security/gdpr-register.md`).

### EX-119 — Carte OZ ID imprimable avec QR (proposition P1)
**Source :** §14 P1, D-K08 · **Priorité :** P1 · **Statut :** En cours (lot 1.13b : n° 1, 2 sans photo et 4 côté API ; photo D-123 ; n° 3, page du QR pour un lecteur non autorisé, au lot 1.13c)

**Récit :** En tant que joueur, je veux une carte imprimable avec mon OZ ID et un QR, afin de la montrer lors d'une détection.

1. LE joueur DOIT pouvoir télécharger sa carte OZ ID en PDF au format carte de crédit.
2. LA carte DOIT afficher : OZ ID, nom, photo, badge de vérification à la date d'édition, QR vers le profil.
3. LE QR DOIT ouvrir le profil selon les droits du lecteur (EX-104) ; pour un mineur, un lecteur non autorisé NE DOIT voir que l'état de vérification, sans données personnelles.
4. LA carte DOIT indiquer sa date d'édition ; le statut affiché en ligne fait foi.

### EX-120 — Parrainage académie vers joueurs (proposition P3)
**Source :** §14 P3, D-K08 · **Priorité :** P1 · **Statut :** Validé au kickoff

**Récit :** En tant qu'académie, je veux un lien d'invitation pour que mes joueurs arrivent déjà rattachés, afin d'accélérer leur inscription.

1. UNE organisation vérifiée DOIT pouvoir générer des liens d'invitation nominatifs ou collectifs.
2. UN joueur inscrit par ce lien DOIT être pré-rattaché, sous réserve de confirmation par les deux parties.
3. LE lien DOIT pouvoir expirer et être révoqué.
4. L'organisation DOIT voir le nombre d'inscriptions issues de ses liens.
5. LE rattachement NE DOIT PAS contourner les exigences tuteur pour les mineurs.

### EX-121 — Score de complétude du profil (proposition P4)
**Source :** §14 P4, D-K08 · **Priorité :** P1 · **Statut :** Validé au kickoff

1. LE profil DOIT afficher un score de complétude de 0 à 100 % et la prochaine action suggérée.
2. LE calcul DOIT être déterministe et implémenté dans `packages/core`.
3. LES organisations DOIVENT voir la complétude moyenne de leurs joueurs rattachés.

### EX-122 — Mode dégradé hors ligne pour l'inscription (proposition P2)
**Source :** §14 P2 · **Priorité :** P2 · **Statut :** [À VALIDER] par le porteur produit

1. LE formulaire d'inscription DEVRAIT pouvoir être rempli hors ligne et envoyé à la reconnexion.
2. AUCUNE donnée sensible (document, selfie) NE DEVRAIT être stockée localement en clair.

### EX-123 — Durcissement, charge et recette
**Source :** lot 1.17 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

1. UN test de charge k6 DOIT valider 200 utilisateurs simultanés sans dégradation sur inscription, recherche et téléversement.
2. UN test d'intrusion interne selon la grille OWASP du §6.4 DOIT être mené et ses écarts corrigés.
3. AUCUNE vulnérabilité critique ou haute NE DOIT rester ouverte.
4. LES runbooks du §10.4 DOIVENT être rédigés.
5. UNE restauration de sauvegarde DOIT réussir en conditions réelles.
6. UN plan de bascule DOIT être écrit.

### EX-124 — Mise en production et ouverture des inscriptions
**Source :** lot 1.18, Annexe D · **Priorité :** P0 · **Statut :** Plan

1. LA checklist de l'Annexe D DOIT être intégralement cochée avant, pendant et après la mise en production.
2. LA bascule DOIT être suivie d'une surveillance renforcée de 72 h avec canal d'incident.
3. L'ouverture DOIT être progressive : liste d'attente puis ouverture générale.
4. UN tableau de bord des KPI d'adoption (§5 de ce document) DOIT être disponible.

**[JALON J2] — Critères d'acceptation de la Phase 1** (§8, repris intégralement) :

| # | Critère | Mesure |
|---|---|---|
| 1 | Les 7 profils peuvent s'inscrire et être vérifiés | Démonstration des 7 parcours |
| 2 | Un joueur obtient un OZ ID et le badge « profil vérifié » après KYC 2 | Parcours E2E vert |
| 3 | Un mineur ne peut pas être publié sans tuteur vérifié | Test bloquant automatisé |
| 4 | Une organisation charge 10 000 inscrits avec rapport et annulation | Import chronométré |
| 5 | Un recruteur non vérifié ne voit aucun mineur | Test de matrice de rôles |
| 6 | Aucune vulnérabilité critique ou haute | Trivy + audit + revue |
| 7 | p95 API < 300 ms, p95 pages < 2,5 s en 3G | k6 + Lighthouse |
| 8 | Sauvegarde restaurée avec succès | Procès-verbal |
| 9 | Documents légaux publiés | Vérification en ligne |
| 10 | Couverture conforme à R6 | Rapport CI |

---

## PHASE 2 — GESTION, MÉMOIRE ET MOBILE

*Objectif : OZ devient un outil de travail quotidien pour les organisations et encaisse ses premiers abonnements (J3).*

### EX-201 — Catalogue et sessions de tests de performance
**Source :** lot 2.1, Annexe E · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-104, EX-111

1. LE module `performance` DOIT proposer 6 tests : sprint 10 m, sprint 30 m, VMA, détente verticale, Yo-Yo, agilité.
2. UNE session de test DOIT être rattachée à un lieu, une date et un évaluateur.
3. TOUTE valeur hors des bornes physiologiques de l'Annexe E pour la catégorie d'âge (U13, U15, U17, U20+) DOIT être refusée à la saisie.
4. TOUTE valeur dans les 5 % extrêmes, ou à plus de 3 écarts-types de l'historique du joueur, DOIT être acceptée mais marquée `À CONFIRMER` et envoyée en revue.
5. LES bornes DOIVENT être validées par un préparateur physique avant mise en service [À CONFIRMER : qui ?].

### EX-202 — Certification à la source (Source A)
**Source :** lot 2.2, §7.5 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-201

**Récit :** En tant qu'évaluateur d'un Centre OZ, je veux saisir les mesures en scannant le QR du joueur et signer ma session, afin que les résultats soient incontestables.

1. L'évaluateur DOIT être authentifié en 2FA sur un compte centre KYC 3.
2. CHAQUE mesure DOIT être attribuée en scannant le QR de l'OZ ID, jamais en le tapant.
3. À la clôture, la session DOIT être signée : hash de l'ensemble des mesures + identifiant évaluateur + horodatage serveur.
4. UNE session signée NE DOIT plus être modifiable ; une correction DOIT créer une révision journalisée.
5. LE statut résultant DOIT être `CERTIFIÉ (CENTRE)`.
6. UNE certification DOIT être révocable par un administrateur, avec motif journalisé.

### EX-203 — Soumission externe et certification différenciée (Source B)
**Source :** lot 2.3, §7.5 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-201, EX-110

1. LE joueur DOIT pouvoir soumettre un résultat avec preuve (procès-verbal et/ou vidéo).
2. LE statut initial DOIT être `SOUMIS — NON CERTIFIÉ`, affiché de façon visuellement distincte d'un résultat certifié.
3. DES contrôles automatiques DOIVENT vérifier métadonnées, montage grossier, cohérence chronométrique et réutilisation de vidéo par empreinte.
4. LA revue DOIT être faite par OZ ou déléguée à un centre partenaire.
5. UN résultat validé DOIT avoir le statut `CERTIFIÉ (SOUMIS)`, visuellement distinct de `CERTIFIÉ (CENTRE)`.

### EX-204 — Courbes de progression et comparaison à la cohorte
**Source :** lot 2.4 · **Priorité :** P1 · **Statut :** Plan · **Dépend de :** EX-201

1. LE profil DOIT afficher la courbe de progression de chaque test dans le temps.
2. CHAQUE résultat DOIT être positionné par rapport à la cohorte d'âge (percentile).
3. LA source de chaque point (centre ou soumis) DOIT être visible sur la courbe.

### EX-205 — Effectifs (roster)
**Source :** lot 2.5 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-109

1. UNE organisation DOIT pouvoir gérer ses effectifs : affectation à une équipe ou catégorie, entrées, sorties, mouvements.
2. TOUT mouvement DOIT être confirmé par les deux parties concernées (joueur ou tuteur, organisation).
3. TOUT mouvement DOIT alimenter le module `history`.

### EX-206 — Mémoire de carrière (history)
**Source :** lot 2.6 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-205

1. LE Système DOIT construire automatiquement la chronologie de carrière du joueur à partir des mouvements, certifications et événements.
2. CHAQUE événement DOIT indiquer sa source et son niveau de vérification.
3. UN événement vérifié NE DOIT pas être modifiable par le joueur.
4. LA chronologie DOIT permettre la traçabilité exigée par l'art. 19 RSTJ FIFA pour les mineurs.

### EX-207 — Tableau de bord Académie
**Source :** lot 2.7 · **Priorité :** P1 · **Statut :** Plan · **Dépend de :** EX-205, EX-201

1. L'académie DOIT voir : effectif, répartition par âge et poste, état de vérification, progression physique, complétude des profils, consultations reçues.

### EX-208 — Tableau de bord Club
**Source :** lot 2.8 · **Priorité :** P1 · **Statut :** Plan · **Dépend de :** EX-205, EX-201

1. LE club DOIT voir : effectif, mouvements, performances certifiées, joueurs suivis, recherches sauvegardées.

### EX-209 — Tableau de bord Fédération
**Source :** lot 2.9, §14 P11 · **Priorité :** P1 · **Statut :** Plan · **Dépend de :** EX-205

1. LA fédération DOIT disposer d'une vue nationale agrégée (inscrits, vérifiés, répartition géographique et par âge).
2. LA fédération DOIT pouvoir appuyer la validation des licences.
3. UN mode observateur en lecture seule, sans données individuelles sensibles, DEVRAIT être proposé (P11) [À VALIDER].

### EX-210 — Abonnements, paiements et facturation
**Source :** lot 2.10, §4.2 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** EX-104

**Récit :** En tant que club camerounais, je veux payer mon abonnement par Orange Money ou MTN MoMo, afin d'accéder aux fonctionnalités premium sans carte bancaire.

1. LE Système DOIT gérer les formules du DP §13.3 : **Joueur — Gratuit** (OZ ID, profil, consultation, soumission de tests et vidéos ; intangible : un joueur existe et peut être découvert sans payer), **Joueur — Premium** optionnel (visibilité, mise en avant, statistiques avancées), **Découverte** (petites structures : effectif limité, suivi, recherche de base), **Pro** (effectif étendu, recherche avancée, statistiques, exports, multi-utilisateurs), **Élite / Institution** (capacités maximales, comparaison complète, accompagnement) ; fédérations sur offre sur mesure (DP §13.4). Chaque formule fixe ses quotas (joueurs gérés, profondeur de recherche, exports, consultations).
1b. L'abonné DOIT pouvoir changer de palier (montée et descente), voir sa date de renouvellement et son historique de facturation (DP §9.3).
2. LES paiements internationaux DOIVENT passer par Stripe (abonnements, portail client, factures, webhooks).
3. LE mobile money (MTN MoMo, Orange Money via CinetPay ou Flutterwave) DOIT être disponible [BLOQUANT].
4. LES fournisseurs DOIVENT être abstraits derrière une interface `PaymentProvider` (ADR-006).
5. LES quotas DOIVENT être appliqués côté serveur, relus en base à chaque requête.
6. LES webhooks DOIVENT être vérifiés par signature et idempotents.
7. TOUTE opération de facturation DOIT être journalisée ; le module DOIT être couvert à 100 %.
8. LES factures DOIVENT être conformes aux obligations fiscales du pays de l'abonné [À CONFIRMER].
9. LES montants de chaque formule DOIVENT être fournis par le porteur produit (« fixés selon le marché », DP §13.3) [À CONFIRMER].

### EX-211 — Application mobile
**Source :** lot 2.11, §0.4 · **Priorité :** P0 · **Statut :** Plan · **Dépend de :** API Phases 1 et 2

1. L'application DOIT être construite en React Native / Expo et consommer la même API que le web.
2. ELLE DOIT permettre : consultation et édition du profil, soumission de tests et preuves, recherche rapide, notifications push.
3. LES schémas de `packages/contracts` DOIVENT être réutilisés pour la validation.
4. LES jetons DOIVENT être stockés dans le stockage sécurisé du système (Keychain / Keystore).
5. L'application DOIT fonctionner sur des appareils Android d'entrée de gamme [À CONFIRMER : version minimale].

### EX-212 — Recherche version 2
**Source :** lot 2.12 · **Priorité :** P1 · **Statut :** Plan · **Dépend de :** EX-201, EX-116

1. LA recherche DOIT accepter des critères de performance (VMA, sprint, etc.), en distinguant résultats certifiés et soumis.
2. L'utilisateur DOIT pouvoir comparer plusieurs profils côte à côte.

### EX-213 — Portail tuteur dédié (proposition P5)
**Source :** §14 P5 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. LE tuteur DEVRAIT voir qui consulte le profil de son enfant, valider les mises en relation et révoquer un accès.

### EX-214 — Attestation PDF vérifiable (proposition P6)
**Source :** §14 P6 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. LE dossier joueur DEVRAIT pouvoir être exporté en PDF signé avec QR de vérification en ligne, vérifiable sans compte OZ.

### EX-215 — Journal de consultation visible du joueur (proposition P10)
**Source :** §14 P10 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. LE joueur majeur DEVRAIT voir combien de recruteurs ont consulté son profil sur une période ; l'identité des consultants DEVRAIT dépendre du palier.

**[JALON J3]**

---

## PHASE 3 — INTELLIGENCE

*Objectif : transformer la donnée vérifiée en aide à la décision, sans jamais remplacer le jugement humain.*

### EX-301 — Moteur de recherche dédié
**Source :** lot 3.1, ADR-005 · **Priorité :** P0 · **Statut :** Plan

1. LA bascule vers Meilisearch DOIT avoir lieu au-delà de 200 000 profils ou si le p95 de recherche dépasse 300 ms.
2. L'indexation DOIT être incrémentale.
3. L'index NE DOIT contenir aucun champ que le rôle interrogeant n'a pas le droit de recevoir ; le filtrage des droits DOIT rester garanti côté API.
4. LES mineurs NE DOIVENT JAMAIS être retournés à un recruteur non KYC 3, y compris via le moteur dédié.

### EX-302 — Comparaison de profils et profils similaires
**Source :** lot 3.2 · **Priorité :** P1 · **Statut :** Plan

1. LE Système DOIT proposer des profils similaires et un radar de qualités.
2. LA similarité DOIT être explicable (critères ayant compté).

### EX-303 — Scoring de potentiel explicable
**Source :** lot 3.3, garde-fou éthique Phase 3 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que recruteur, je veux un indicateur de potentiel dont je comprends chaque facteur, afin de m'en servir comme aide à la lecture et non comme verdict.

1. CHAQUE score DOIT afficher ses facteurs et sa marge d'incertitude.
2. AUCUN score NE DOIT produire de décision automatique sur la carrière d'un mineur.
3. LE score DOIT être auditable (version du modèle, données utilisées) et contestable par le joueur ou le tuteur.
4. LE scoring DOIT être classé AI-ADVISORY au sens de `/ai-governance` s'il utilise un modèle statistique ou d'IA.

### EX-304 — Rapports automatiques PDF
**Source :** lot 3.4 · **Priorité :** P1 · **Statut :** Plan

1. LE Système DOIT générer des rapports PDF : dossier joueur, dossier de détection, rapport d'académie.
2. LA génération DOIT être asynchrone ; chaque rapport DOIT être filigrané au nom du destinataire.

### EX-305 — Analytique avancée
**Source :** lot 3.5 · **Priorité :** P1 · **Statut :** Plan

1. LE Système DOIT fournir analyses de cohortes et tableaux de bord institutionnels.
2. LES agrégats NE DOIVENT PAS permettre de ré-identifier un mineur (seuil minimal de taille de groupe) [À CONFIRMER : seuil].

### EX-306 — Détection statistique de fraude et audit des centres
**Source :** lot 3.6, §7.5, §7.6 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT détecter les centres et évaluateurs dont la distribution de résultats dérive anormalement de la moyenne nationale.
2. UN centre signalé DOIT faire l'objet d'un audit humain ; aucune sanction NE DOIT être automatique.
3. LA détection de doublons par graphe (appareil, IP, document, parrain) DEVRAIT être ajoutée (P8) [À VALIDER].

### EX-307 — Mise à l'échelle
**Source :** lot 3.7, §3.6 · **Priorité :** P0 · **Statut :** Plan

1. LES réplicas de lecture DOIVENT être activés via le `DatabaseService`.
2. LA mise à l'échelle horizontale DOIT suivre les seuils du §10.3.
3. LE top 20 des requêtes `pg_stat_statements` DOIT être revu et optimisé.
4. LES objectifs RTO/RPO DOIVENT être durcis [À CONFIRMER : nouvelles valeurs].
5. LA migration d'hébergement vers Azure Container Apps ou Scaleway DOIT être évaluée (§4.2).

### EX-308 — Webhooks et API partenaires (proposition P7)
**Source :** §14 P7 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. UN club DEVRAIT pouvoir connecter son outil par webhooks et API authentifiée, avec quotas.

### EX-309 — Comparaison à la cohorte nationale (proposition P9)
**Source :** §14 P9 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. LE Système DEVRAIT exprimer un résultat en percentile national (« VMA supérieure à 87 % des U17 camerounais mesurés »), avec la taille de l'échantillon.

### EX-310 — Registre de preuves ancré (proposition P12)
**Source :** §14 P12 · **Priorité :** P1 · **Statut :** [À VALIDER]

1. UN hash racine du journal de preuves DEVRAIT être publié mensuellement, pour prouver l'absence d'altération rétroactive.

**[JALON J4]**

---

## PHASE 4 — RELATION ET PREUVE ENRICHIE

### EX-401 — Module vidéo
**Source :** lot 4.1 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT accepter le téléversement de vidéos, les transcoder en débit adaptatif, générer des vignettes et les diffuser par CDN.
2. LES vidéos DOIVENT passer les mêmes contrôles de sécurité que les documents (EX-110).
3. LA diffusion DOIT s'adapter aux connexions faibles (débit minimal) [À CONFIRMER : débit cible].
4. UNE vidéo de mineur DOIT suivre les règles de visibilité de EX-T16.

### EX-402 — Bibliothèque de séquences et montage simple
**Source :** lot 4.2 · **Priorité :** P1 · **Statut :** Plan

1. LE joueur ou son organisation DOIT pouvoir organiser ses séquences, marquer des temps forts et créer un montage simple.

### EX-403 — Vérification renforcée des vidéos
**Source :** lot 4.3, §7.6 · **Priorité :** P0 · **Statut :** Plan

1. LE Système DOIT vérifier métadonnées, détecter les manipulations et calculer une empreinte perceptuelle de séquence.
2. UNE vidéo réutilisée (déjà soumise par un autre compte) DOIT être signalée.

### EX-404 — Messagerie encadrée
**Source :** lot 4.4, §6.7 · **Priorité :** P0 · **Statut :** Plan [BLOQUANT]

**Récit :** En tant que tuteur, je veux que tout échange concernant mon enfant passe par moi ou par son académie, afin qu'aucun inconnu ne puisse le contacter directement.

1. AUCUN contact direct avec un mineur NE DOIT être possible ; tout échange passe par l'organisation de rattachement ou le tuteur.
2. TOUT échange DOIT être journalisé.
3. UN bouton de signalement DOIT être intégré à chaque fil.
4. LA messagerie NE DOIT être ouverte qu'aux comptes vérifiés.

### EX-405 — Demandes de contact structurées
**Source :** lot 4.5 · **Priorité :** P1 · **Statut :** Plan

1. UN recruteur DOIT pouvoir envoyer une demande de contact structurée (objet, club, contexte), suivie jusqu'à réponse.
2. LE Système DOIT produire des statistiques de mise en relation.

**[JALON J5]**

---

## PHASE 5 — ÉCOSYSTÈME

> Le plan ne décrit les lots de Phase 5 qu'en une ligne. Les critères ci-dessous sont des **hypothèses de Claude [À CONFIRMER]**, à préciser par le porteur produit au démarrage de la phase.

### EX-501 — OZ Legal
**Source :** lot 5.1 · **Priorité :** P1 · **Statut :** [À CONFIRMER]

1. LE Système DOIT proposer une bibliothèque de modèles de contrats (formation, mandat d'agent, premier contrat professionnel).
2. LE Système DOIT alerter sur les situations de non-conformité connues (ex. transfert international de mineur, art. 19 RSTJ).
3. UN accompagnement spécifique des mineurs et de leurs tuteurs DOIT être proposé.
4. LES contenus DOIVENT être validés par un juriste ; OZ NE DOIT PAS se présenter comme conseil juridique.

### EX-502 — OZ Career
**Source :** lot 5.2 · **Priorité :** P1 · **Statut :** [À CONFIRMER]

1. LE joueur DOIT recevoir une orientation fondée sur son profil, ses jalons de carrière et des mises en relation qualifiées.
2. TOUTE recommandation DOIT être explicable et ne produire aucune décision automatique sur un mineur (EX-303).

### EX-503 — Marketplace de services
**Source :** lot 5.3 · **Priorité :** P1 · **Statut :** [À CONFIRMER]

1. LE Système DOIT proposer un catalogue de services fournis par des prestataires vérifiés (KYC 2 minimum).
2. LES transactions DOIVENT passer par `PaymentProvider` avec prélèvement d'une commission.
3. UN prestataire DOIT pouvoir être évalué et signalé.
4. AUCUN service NE DOIT permettre un contact direct non journalisé avec un mineur.

### EX-504 — OZ Band
**Source :** lot 5.4 · **Priorité :** P2 · **Statut :** [À CONFIRMER]

1. LE Système DOIT ingérer les données d'objets connectés via une passerelle et agréger charge et récupération.
2. CES données NE DOIVENT PAS être des données de santé au sens réglementaire sans analyse préalable (EX-T16 n° 7) [À CONFIRMER].
3. LE consentement explicite (tuteur pour un mineur) DOIT précéder toute ingestion.

### EX-505 — API publique et partenaires
**Source :** lot 5.5 · **Priorité :** P1 · **Statut :** [À CONFIRMER]

1. LES partenaires DOIVENT accéder à l'API par clés révocables, avec quotas et documentation.
2. UN bac à sable avec données synthétiques DOIT être fourni.
3. L'API publique DOIT appliquer la même matrice de droits que l'interface (EX-104).

### EX-506 — Multilingue complet et expansion multi-pays
**Source :** lot 5.6 · **Priorité :** P0 · **Statut :** Plan

1. L'interface DOIT être entièrement disponible en français, anglais et portugais.
2. L'ajout d'un pays DOIT être une opération de configuration (pays, régions, règles locales, fournisseurs de paiement), sans migration de schéma.
3. LA souveraineté de la donnée DOIT être réévaluée à l'expansion (région d'hébergement africaine, ADR-003).

**[JALON J6]**

---

## 5. Cibles de succès

> **[À CONFIRMER]** — le Document de Projet définit quatre familles d'indicateurs (DP §18 : Adoption, Engagement, Qualité & confiance, Économie) mais aucune valeur cible. Les valeurs ci-dessous sont proposées par Claude pour un lancement au Cameroun (D-K09), rangées dans ces familles. Elles alimentent le tableau de bord EX-124. Le DP §17.3 désigne les académies comme acteurs pivots de l'adoption : les cibles « académies » priment.

### 5.1 Six mois après J2

| Indicateur | Cible proposée | Mesure | Si la cible est manquée |
|---|---|---|---|
| Profils joueurs créés (inscription + import) | 15 000 | Compteur base, hors comptes supprimés | Analyser la part import / inscription directe ; renforcer le parrainage (EX-120) |
| Académies actives (≥ 1 import ou ≥ 20 joueurs rattachés) | 30 | Requête organisations | Accompagnement direct des académies, guide d'import |
| Part de profils joueurs en KYC 2 | 25 % | Statut `VERIFIED` / profils actifs | Analyser les motifs d'abandon et de rejet KYC |
| Recruteurs et agences vérifiés KYC 3 | 20 | Statut KYC 3 | Démarchage ciblé, simplifier les justificatifs |
| Taux de complétion de l'onboarding joueur | 60 % | Entonnoir par étape (§12.1) | Optimiser l'étape la plus abandonnée (§13.1) |
| Délai de décision KYC | 95 % < 48 h ouvrées | Métrique back-office | Renfort de revue, ajustement des seuils |
| Incidents de sécurité impliquant des données de mineurs | 0 | Registre d'incidents | Revue de sécurité immédiate, gel si nécessaire |

### 5.2 Indicateurs de suivi (3, 6, 12 mois)

- Taux de rejet KYC par motif (mensuel, §13.1)
- Part des profils mineurs avec tuteur vérifié
- Nombre de consultations de profils vérifiés par recruteur
- Profils créés par lien de parrainage (EX-120)
- Score de complétude moyen (EX-121)

### 5.3 Phases suivantes (à préciser au démarrage de chaque phase)

| Phase | Indicateur principal proposé |
|---|---|
| 2 | Nombre d'abonnements payants, part mobile money ; nombre de sessions certifiées en centre |
| 3 | Utilisation de la comparaison et des rapports ; taux de contestation des scores |
| 4 | Demandes de contact structurées et taux de réponse ; signalements traités sous 48 h |
| 5 | Transactions marketplace, partenaires API actifs, pays ouverts |

---

## 6. Questions ouvertes

### 6.1 Bloquantes (à trancher avant le lot concerné)

| # | Question | Impact | Responsable | Avant |
|---|---|---|---|---|
| Q1 | ~~Cellules déduites (*) de la matrice EX-104~~ — **Tranché par Gaëtan Wassu le 2026-11-02** (décisions D1 à D7 du lot 1.4a) | — | — | — |
| Q2 | ~~Le KYC 3 organisationnel est-il bien inclus en Phase 1 (EX-112) ?~~ — **Tranché par Fabrice Olinga le 2026-11-10 : oui**, validation manuelle par l'équipe OZ au départ | — | — | — |
| Q3 | ~~Contradiction §7.3 / §7.4 sur l'approbation automatique~~ — **Tranché par TD-016** : revue humaine au lancement, approbation automatique des majeurs activable par drapeau après preuve mesurée | — | — | — |
| Q4 | ~~Checksum OZ ID~~ — **Tranché par TD-017** : Damm sur base 32 Crockford, identifiant entier | — | — | — |
| Q5 | ~~Fournisseur OCR, vivacité, concordance faciale~~ — **Tranché par TD-015** : fournisseur spécialisé, POC Veriff / Smile ID au lot 1.10 | — | — | — |
| Q6 | ~~Convergence des deux univers du DP §12.2~~ — **Tranché le 2026-11-10 par la charte OZ Football ID v1.0** ([ADR-009](docs/adr/ADR-009-identite-visuelle.md)) | — | — | — |
| Q15 | ~~Périmètre de Phase 1 (OZ Performance et tableau de bord)~~ — **Tranché par Fabrice Olinga le 2026-11-10 : en Phase 2**, découpage du plan validé | — | — | — |
| Q16 | ~~Web responsive suffisant pour l'ouverture ?~~ — **Tranché par Fabrice Olinga le 2026-11-10 : oui**, site conçu d'abord pour le téléphone, sans PWA installable en Phase 1 ; application mobile en Phase 2 | — | — | — |
| Q17 | **Format OZ ID :** les maquettes affichent `OZ-CM-08-4K7X2` (année 2008 = naissance ? 5 caractères, pas de checksum) ; le plan impose `OZ-CM-26-7K4M9Q-3` (année d'émission, 6 caractères + checksum). Le plan prévaut sauf décision contraire ; les maquettes sont à corriger | Format immuable à vie | Gaëtan Wassu | Lot 1.2 |
| Q18 | ~~« OZ Score » / « OZ Index » des maquettes~~ — **Tranché par Fabrice Olinga le 2026-11-10 : retiré de la première version** (aucune note de potentiel affichée) ; repris en Phase 2-3 avec OZ Performance et EX-303 | — | — | — |
| Q20 | **Entité qui encaisse et facture** (EXISTE au Québec, société OZ au Cameroun, autre ?) : comptes Stripe et CinetPay, TVA, conformité des factures (TD-013) | Billing, mentions légales | Fabrice Olinga | Lot 2.10 (mentions légales : lot 1.6) |
| Q19 | ~~Nom de marque~~ — **Tranché le 2026-11-10 : « OZ Football ID »** ([ADR-009](docs/adr/ADR-009-identite-visuelle.md)) | — | — | — |
| Q7 | Politique de confidentialité et CGU : **textes provisoires rédigés le 2026-11-10** à la demande de Fabrice Olinga ([confidentialité](docs/legal/politique-confidentialite.md), [CGU](docs/legal/cgu.md)) ; relecture par un juriste en fin de projet, avant l'ouverture en production (l'OAPI couvre la marque, pas la protection des données) | Ouverture en production | Fabrice Olinga | Fin de projet |
| Q8 | Montants des formules : **grille provisoire proposée le 2026-11-10** ([tarifs](docs/legal/tarifs-provisoires.md)) à la demande de Fabrice Olinga, qui fournira les prix définitifs en fin de projet ; en Phase 1, palier gratuit seul appliqué | Billing (2.10) | Fabrice Olinga | Fin de projet (avant le lot 2.10) |

### 6.3 Confirmations du 2026-11-10 (Fabrice Olinga)

| # | Décision confirmée | Référence |
|---|---|---|
| Q21 | Suppression de compte : 30 jours pour changer d'avis (fiche cachée), compte suspendu gelé, puis anonymisation ; pour un mineur, demande du tuteur, annulée à sa majorité | [account-deletion.md](docs/security/account-deletion.md), lots 1.16ca à 1.16cbb |
| Q22 | Fiche en PDF : tout lecteur autorisé télécharge sa vue, filigranée à son nom ; carte OZ ID sans photo | Lot 1.13b |
| Q23 | Recherche : l'académie ne filtre ni sur la taille, le poids, ni le pied fort ; nul ne filtre sur l'organisation d'un autre ; texte libre sur le nom ; mineurs listés journalisés | [rbac.md](docs/security/rbac.md), lot 1.14a |
| Q24 | Slogan du logo : « Beyond potential » (et non « Beyong ») ; fichiers corrigés à obtenir du graphiste avant toute impression | [ADR-009](docs/adr/ADR-009-identite-visuelle.md), D-126 |

### 6.2 Non bloquantes (hypothèse par défaut si non tranchées)

| # | Question | Hypothèse par défaut |
|---|---|---|
| Q9 | Durée de conservation des documents d'identité (`DOCUMENT_RETENTION_DAYS`) | 90 jours après décision, comme l'Annexe C |
| Q10 | Le KYC 3 joueur (acte de naissance + fédération) est-il en Phase 1 ? | Non, Phase 2 |
| Q11 | Seuil minimal de taille de groupe pour les agrégats (EX-305) | 10 personnes |
| Q12 | Version Android minimale pour l'application mobile | Android 8 (API 26) |
| Q13 | Préparateur physique validant l'Annexe E | À désigner par le porteur produit avant le lot 2.1 |
| Q14 | Agrégateur SMS : Twilio ou agrégateur local camerounais ? | Twilio derrière une interface abstraite, comme `PaymentProvider` |

---

## 7. Traçabilité lots du plan → exigences

| Lot | Exigence | Lot | Exigence | Lot | Exigence |
|---|---|---|---|---|---|
| 0.1 | EX-001 | 1.6 | EX-106 | 2.6 | EX-206 |
| 0.2 | EX-002 | 1.7 | EX-107 | 2.7 | EX-207 |
| 0.3 | EX-003 | 1.8 | EX-109 | 2.8 | EX-208 |
| 0.4 | EX-004 | 1.9 | EX-110 | 2.9 | EX-209 |
| 0.5 | EX-005 | 1.10 | EX-111, EX-112 | 2.10 | EX-210 |
| 0.6 | EX-006 | 1.11 | EX-113 | 2.11 | EX-211 |
| 0.7 | EX-007 | 1.12 | EX-114 | 2.12 | EX-212 |
| 0.8 | EX-008 | 1.13 | EX-115 | 3.1-3.7 | EX-301 à EX-307 |
| 0.9 | EX-009 | 1.14 | EX-116 | 4.1-4.5 | EX-401 à EX-405 |
| 0.10 | EX-010 | 1.15 | EX-117 | 5.1-5.6 | EX-501 à EX-506 |
| 0.11 | EX-011 | 1.16 | EX-118 | §14 P1, P3, P4 | EX-119, EX-120, EX-121 |
| 1.1 | EX-101 | 1.17 | EX-123 | §14 P2 | EX-122 |
| 1.2 | EX-102 | 1.18 | EX-124 | §14 P5, P6, P10 | EX-213, EX-214, EX-215 |
| 1.3 | EX-103 | 2.1-2.3 | EX-201 à EX-203 | §14 P7, P9, P12 | EX-308, EX-309, EX-310 |
| 1.4 | EX-104 | 2.4 | EX-204 | §14 P8, P11 | EX-306 n° 3, EX-209 n° 3 |
| 1.5 | EX-105 | 2.5 | EX-205 | Tuteur (D-K03) | EX-108 |
