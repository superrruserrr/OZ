# OZ — Conception (design.md)

**Sources :** `OZ_Document_de_Projet.pdf` (DP) · `docs/PLAN.md` · `requirements.md` · maquettes `EX CHART/` · **Statut :** Brouillon — à valider
**Références :** les identifiants `EX-xxx` renvoient à `requirements.md` ; les `§x.y` au plan technique.

---

## 1. Vue d'ensemble

### 1.1 Le problème

Dans le football africain, et camerounais en particulier, la fraude à l'âge et à l'identité détruit la confiance entre ceux qui forment les talents (joueurs, académies, clubs) et ceux qui les recrutent (clubs, recruteurs, agences, fédérations). Un recruteur ne peut pas croire une date de naissance ; un jeune talent ne peut pas prouver ce qu'il vaut ; un mineur est exposé à de fausses promesses. Il n'existe pas de registre de référence partagé et digne de confiance.

### 1.2 L'approche

OZ est une **place de marché à deux faces avec un tiers de confiance** (§3.1) :

- **Offre** : joueurs (et leurs tuteurs), académies, clubs.
- **Demande** : recruteurs, agences, clubs, fédérations.
- **Confiance** : un KYC multi-niveaux à double vérification client/serveur (§7), et des Centres OZ Performance qui certifient les mesures physiques à la source (§7.5).

La valeur produite est **une donnée vérifiée, traçable et protégée** : un OZ ID unique à vie, un badge « Profil vérifié » qu'on ne peut pas obtenir frauduleusement, et une mémoire de carrière que personne ne peut réécrire.

L'architecture est un **monolithe modulaire** (NestJS + Next.js, TypeScript de bout en bout) sur une base PostgreSQL unique à cloisonnement logique (§3.5). Elle est conçue mobile-ready, multi-pays et sans état dès la Phase 1, pour monter en charge sans réécriture.

---

## 2. Principes de conception

Ces principes tranchent les cas que les exigences ne couvrent pas explicitement.

1. **Le serveur ne fait jamais confiance au client — sur rien.** (§7.1, EX-T04) Le client valide pour guider, le serveur valide pour décider. Un schéma unique dans `packages/contracts`, exécuté des deux côtés. En cas de doute sur l'origine d'une valeur, elle est relue en base.

2. **On n'envoie pas ce qu'on n'a pas le droit de montrer.** (§3.5) Un champ interdit n'est pas masqué côté client : il est absent de la réponse. La sérialisation par vue est la règle, pas une option.

3. **La donnée d'un mineur est traitée comme si l'avenir du projet en dépendait.** (Clause finale, EX-T16) Refus par défaut, journalisation de tout accès, jamais de décision automatique irrévocable, jamais de contact direct.

4. **Conserver la preuve, pas le document.** (§7.4) OZ garde la décision, l'empreinte et les métadonnées ; le document d'identité brut est purgé. La surface de risque en cas de fuite est minimale, la valeur du badge intacte.

5. **Escalader plutôt que rejeter, signaler plutôt que bloquer — sauf en sécurité.** (§7.2, §7.5) Un écart OCR part en revue humaine ; une performance aberrante est marquée `À CONFIRMER`. À l'inverse, un fichier infecté, une signature invalide ou un rôle non autorisé sont refusés net.

6. **Rien n'est à moitié fait.** (§0.2) Une couche n'est commencée que quand la précédente est mergée, testée, documentée et déployée en recette.

---

## 3. Approche technologique

> **Section à finaliser par `/tech-stack`.** Le plan technique fixe déjà la stack complète au §4.2 et les ADR à rédiger au §4.3. `/tech-stack` ne la réinventera pas : il la validera, comblera les trous ci-dessous et consignera les choix en ADR.

**Stack retenue par le plan (résumé) :** TypeScript strict · pnpm + Turborepo · Next.js 15 · NestJS 11 · Zod · Prisma 6 · PostgreSQL 16 · Redis 7 + BullMQ · stockage S3 (R2 ou Scaleway) · Tailwind + shadcn/ui · Vitest, Supertest + Testcontainers, Playwright, k6 · Docker, Coolify, Cloudflare, GitHub Actions · Sentry, Grafana/Loki/Prometheus.

**Choix que `/tech-stack` doit encore trancher :**

| Sujet | Options | Réf. |
|---|---|---|
| Fournisseur OCR, vivacité, concordance faciale | Service externe (souveraineté, DPA, coût) ou modèle auto-hébergé | Q5 |
| Algorithme de checksum OZ ID | Crockford mod 37 (problème de symboles), Damm, Luhn mod N, 2 caractères | Q4 |
| Hébergeur VPS | Hetzner ou OVH | §4.2 |
| Stockage objets | Cloudflare R2 ou Scaleway | §4.2 |
| Mobile money | CinetPay ou Flutterwave | §4.2 |
| SMS | Twilio ou agrégateur local | Q14 |
| Email | Resend ou Postmark | §4.2 |
| Outil de tickets | GitHub Projects ou Linear | §2.5 |
| Tests de propriétés | `fast-check` (à faire passer par R12) | §7 de ce document |

---

## 4. Propriétés de correction

Invariants qui doivent tenir pour **toute** entrée valide et **tout** état atteignable. Chacun est directement testable ; la colonne « Test » indique la forme du test.

### 4.1 Identité et OZ ID

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-01 | Pour tout OZ ID émis, le checksum calculé hors ligne est valide, et toute altération d'un seul caractère le rend invalide. | EX-102 | Propriété (`fast-check`) |
| CP-02 | Pour tout ensemble d'OZ ID émis, y compris sous concurrence, aucun n'est en double. | EX-102 | Charge + contrainte `UNIQUE` |
| CP-03 | Pour tout joueur, l'OZ ID ne change jamais après émission, et un OZ ID n'est jamais réattribué, même après suppression du compte. | EX-102, EX-118 | Intégration |
| CP-04 | Pour tout OZ ID, la partie aléatoire ne contient aucun des caractères I, L, O, U. | EX-102 | Propriété |

### 4.2 Validation et autorité du serveur

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-05 | Pour toute requête rejetée par le schéma Zod, aucune logique métier n'est exécutée et aucune écriture n'a lieu. | EX-T04 | Intégration |
| CP-06 | Pour toute requête, un champ absent du schéma n'atteint jamais le service (`strict()`). | EX-T04 | Propriété sur payloads aléatoires |
| CP-07 | Pour tout compte, aucune requête émise par ce compte ne peut modifier son propre rôle, son propre niveau KYC ou son propre statut de vérification. | EX-T04 n° 7 | Matrice de rôles |
| CP-08 | Pour toute décision d'autorisation, le résultat est identique quel que soit le contenu des en-têtes, du corps ou du jeton relatif au rôle, à l'âge, au KYC ou au palier. | EX-T04 n° 5 | Propriété (falsification de jeton) |

### 4.3 Cloisonnement et mineurs

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-09 | Pour tout couple (rôle, endpoint) non autorisé par la matrice, la réponse est 403, jamais 200 avec données filtrées. | EX-104 | Matrice exhaustive |
| CP-10 | Pour toute réponse API, aucun champ absent de la vue du rôle demandeur n'est présent dans le payload. | EX-104, EX-115 | Inspection de payload |
| CP-11 | Pour toute réponse API à quelque rôle que ce soit, les coordonnées directes d'un mineur sont absentes (seul le tuteur de l'enfant et l'admin journalisé y accèdent). | EX-T16 n° 4 | Inspection de payload |
| CP-12 | Pour tout recruteur ou agence sans KYC 3 validé, aucune recherche, aucune fiche, aucun export, aucun QR ne renvoie un profil de mineur. | EX-T16 n° 6, EX-116 | Matrice + E2E n° 4 |
| CP-13 | Pour tout profil de mineur publié, il existe un tuteur rattaché en KYC 2 et un consentement non révoqué, horodaté côté serveur, antérieur à la publication. | EX-T16 n° 3, EX-108 | Intégration + contrainte base |
| CP-14 | Pour toute consultation d'un profil de mineur par un recruteur ou une agence, il existe exactement une entrée d'audit correspondante, visible du tuteur. | EX-T16 n° 5 | Intégration |
| CP-15 | Pour toute personne, le statut « mineur » est recalculé à chaque requête à partir de la date de naissance et du jour serveur ; il n'est jamais lu depuis un jeton ou un cache. | EX-T16 n° 1 | Test de bascule au 18e anniversaire |

### 4.4 KYC

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-16 | Pour tout dossier KYC concernant un mineur, un tuteur, un recruteur, une agence ou un centre, l'état `approved` implique deux approbations par deux administrateurs distincts. | EX-113 n° 4 | Intégration + contrainte base |
| CP-17 | Pour tout dossier KYC concernant un mineur, aucune approbation et aucun rejet automatiques fondés sur un signal d'IA ne sont possibles, quel que soit le score. | EX-111 n° 6, EX-T16 n° 9 | Propriété sur scores aléatoires |
| CP-17b | Pour tout rejet automatique, la cause est un signal déterministe de la liste TD-016 ; aucun signal d'IA seul ne produit un rejet. Tant que `kyc.autoApproveAdults` est inactif, aucune approbation n'a lieu sans décision humaine. | EX-111 n° 6, TD-016 | Propriété sur signaux aléatoires |
| CP-18 | Pour toute transition d'état de vérification, il existe une entrée d'audit avec acteur et motif ; aucune transition hors du graphe du §5.4 n'est possible. | EX-111 n° 8 | Propriété (machine à états) |
| CP-19 | Pour tout badge affiché « vérifié », la transition correspondante est écrite en base et journalisée avant l'envoi de la réponse. | EX-T04 n° 8 | Intégration |
| CP-20 | Pour tout document dont `retention_until` est dépassé, le binaire n'existe plus dans le stockage ; seules l'empreinte et les métadonnées subsistent. | EX-110 n° 7, EX-111 n° 11 | Job de purge testé |

### 4.5 Documents, audit, import

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-21 | Pour tout document accessible, son statut antivirus est `clean` ; un document `pending`, `infected` ou `error` n'a jamais d'URL signée. | EX-110 | Intégration |
| CP-22 | Pour toute URL de document, l'accès échoue sans signature valide ou au-delà de 5 minutes. | EX-110 n° 6 | Intégration |
| CP-23 | Pour toute entrée N du journal d'audit, `hash(N)` = H(contenu(N) ‖ hash(N−1)) ; la vérification de chaîne détecte toute modification ou suppression. | EX-T11 | Propriété |
| CP-24 | Pour toute passe à blanc d'import, le nombre de lignes écrites en base est zéro. | EX-114 n° 3 | Intégration |
| CP-25 | Pour tout import annulé dans les 72 h, la base revient à l'état antérieur à l'import : aucun profil, document, rattachement ni OZ ID actif n'en subsiste (les OZ ID restent réservés). | EX-114 n° 9 | Intégration |
| CP-26 | Pour tout import exécuté, lignes acceptées + rejetées + doublons = lignes totales du fichier. | EX-114 n° 8 | Propriété sur fichiers aléatoires |

### 4.6 Authentification, performance, facturation

| # | Propriété | Valide | Test |
|---|---|---|---|
| CP-27 | Pour toute famille de jetons de rafraîchissement, la présentation d'un jeton déjà consommé révoque tous les jetons de la famille. | EX-103 n° 5 | E2E n° 8 |
| CP-28 | Pour toute tentative de connexion ou de réinitialisation, la réponse ne permet pas de distinguer un compte existant d'un compte inexistant (contenu et délai). | EX-103 n° 10 | Intégration |
| CP-29 | Pour toute session de test signée, le hash stocké correspond aux mesures stockées ; toute modification ultérieure crée une révision et non une réécriture. | EX-202 | Propriété |
| CP-30 | Pour toute mesure hors des bornes de l'Annexe E pour la catégorie d'âge, la saisie est refusée. | EX-201 n° 3 | Propriété sur valeurs aléatoires |
| CP-31 | Pour tout résultat de performance affiché, sa source (centre ou soumis) et son statut de certification sont visibles et distincts. | EX-203 n° 5 | Test visuel + payload |
| CP-32 | Pour tout webhook de paiement rejoué, l'état de l'abonnement est identique à celui obtenu après une seule réception (idempotence). | EX-210 n° 6 | Intégration |
| CP-33 | Pour toute requête soumise à quota, le quota appliqué est celui du palier relu en base au moment de la requête. | EX-210 n° 5 | Intégration |

---

## 5. Flux métier

Les flux décrivent **quoi** et **quand**, pas l'interface.

### 5.1 Inscription d'un joueur

```
Flux : Inscription joueur
Déclencheur : un visiteur commence l'inscription « joueur » (directement ou via un lien de parrainage)
Préconditions : pages légales publiées (EX-106) ; visiteur non connecté

1. Création du compte (email, mot de passe) ; contrôles anti-bot (reCAPTCHA, piège, chronométrie)
   - Si le score anti-bot est insuffisant : refus générique, sans détail
2. Envoi de l'email de confirmation ; aucune autre action possible avant confirmation
3. Étape identité : nom, prénoms, date de naissance, nationalité, pays, ville
   - Le serveur calcule l'âge ; si < 6 ou > 45 ans : rejet 422
   - Si mineur : le parcours ajoute l'étape « tuteur », obligatoire
4. Étape sport : poste principal et secondaire, pied fort, taille, poids
5. Étape rattachement : organisation (optionnelle)
   - Si arrivée par lien de parrainage : organisation pré-remplie, confirmation demandée
6. Si mineur : étape tuteur → flux 5.2 (le profil reste non publiable jusqu'à sa fin)
7. Étape photo → flux 5.4 (téléversement)
8. Validation finale : réservation atomique de l'OZ ID, statut DECLARED (KYC 0)
9. Écriture d'audit « création de compte » ; calcul du score de complétude

Chaque étape est sauvegardée côté serveur ; une reprise repart de la dernière étape validée.

Postconditions : compte confirmé, OZ ID émis et immuable, profil en DECLARED,
non visible des organisations tant que KYC 1 n'est pas atteint.
```

### 5.2 Rattachement et vérification du tuteur

```
Flux : Tuteur légal
Déclencheur : un joueur mineur atteint l'étape tuteur, ou un tuteur s'inscrit directement
Préconditions : profil joueur mineur existant

1. Le joueur saisit le contact du tuteur ; une invitation part par SMS ou email
   - Si le tuteur a déjà un compte : demande de rattachement
2. Le tuteur crée son compte et confirme son email
3. Le tuteur déclare son lien avec l'enfant et fournit le justificatif de lien
4. Le tuteur passe le KYC 1 (OTP SMS) puis le KYC 2 → flux 5.3, revue humaine systématique,
   quatre yeux
5. Si le KYC 2 du tuteur est approuvé : le tuteur lit et signe le consentement
   (version du texte conservée, horodatage serveur)
6. Le profil de l'enfant devient publiable, sous réserve de son propre KYC 2
7. À tout moment, le tuteur peut révoquer le consentement → dépublication immédiate, audit

Postconditions : un tuteur KYC 2 rattaché et un consentement valide existent ;
sinon, le profil de l'enfant reste non publiable.
```

### 5.3 Vérification KYC 2

```
Flux : KYC 2
Déclencheur : soumission d'un dossier KYC 2 par un joueur, un tuteur ou un dirigeant
Préconditions : KYC 1 atteint (téléphone vérifié) ; moins de 3 rejets sur les 30 derniers jours

1. Téléversement du document et du selfie → flux 5.4 ; statut du dossier : submitted
2. Réception synchrone (< 300 ms) : signature, MIME réel, taille, SHA-256, recherche d'un
   document identique déjà soumis ; statut : PENDING
3. Traitement asynchrone : antivirus → ré-encodage → qualité → OCR → concordance
   déclaratif/OCR → falsification → vivacité → concordance faciale → doublon → score
   - Si infecté : rejet immédiat + alerte sécurité
   - Si illisible : rejet motivé, resoumission possible
4. Aiguillage (TD-016) :
   - Signal déterministe (infecté, MIME incohérent, expiré, illisible, âge hors bornes)
     → rejet automatique motivé
   - Sujet mineur, tuteur, recruteur, agence ou centre → revue humaine, quatre yeux
   - Tout autre dossier → revue humaine
   - Exception activable par drapeau kyc.autoApproveAdults (inactif au lancement) :
     sujet majeur, score < 25, aucun signal fort → approbation automatique,
     dont 10 % revus chaque semaine
5. Revue humaine (flux 5.5) si requise
6. Décision écrite en base + audit chaîné, PUIS badge attribué, PUIS notification
7. Si approuvé : purge programmée du document brut
   Si rejeté : motif communiqué, compteur incrémenté ; au 3e rejet, blocage 30 jours

Postconditions : dossier dans un état terminal (approved / rejected) avec décision journalisée ;
statut du sujet VERIFIED ou REJECTED.
```

**Deux machines à états distinctes :** le **statut de vérification du sujet** (`declared → pending → in_review → verified | rejected → suspended`, §5.4) et le **statut du dossier KYC** (`draft → submitted → in_review → approved | rejected | expired`, §5.2). Un sujet peut avoir plusieurs dossiers successifs ; son statut reflète le dernier dossier terminal.

### 5.4 Téléversement d'un document

```
Flux : Téléversement
Déclencheur : un utilisateur ajoute un fichier (photo, document, justificatif, vidéo)
Préconditions : utilisateur authentifié ; limite de débit non atteinte

1. Le client compresse, redimensionne, supprime les EXIF, vérifie le MIME (confort uniquement)
2. L'API délivre une URL de téléversement signée et à usage unique
3. Le client envoie le fichier directement au stockage
4. Le serveur vérifie la signature, le MIME réel, la taille, les dimensions, le nombre de pages
5. Le serveur calcule le SHA-256 et enregistre le document en av_status = pending
6. Le worker scanne (ClamAV), ré-encode, calcule l'empreinte perceptuelle
   - Infecté : av_status = infected, fichier supprimé, alerte sécurité
7. av_status = clean : le document devient accessible par URL signée de 5 minutes

Postconditions : le fichier est sain, ré-encodé, empreinté, avec une date de purge.
```

### 5.5 Décision humaine avec règle des quatre yeux

```
Flux : Revue KYC
Déclencheur : un dossier arrive en file de revue
Préconditions : administrateur authentifié avec 2FA

1. La file est triée : mineurs d'abord, puis ancienneté, puis score
2. L'administrateur 1 ouvre le dossier : document, selfie, déclaratif, écarts surlignés, historique
3. Il choisit une décision et un motif dans la liste normalisée
   - Si la règle des quatre yeux ne s'applique pas : décision finale → étape 6
   - Sinon : dossier en attente de second validateur
4. L'administrateur 2, distinct du premier, ouvre le dossier
5. Il confirme ou infirme
   - Désaccord : le dossier repasse en revue avec les deux avis [À CONFIRMER : arbitrage]
6. Décision écrite + audit chaîné (deux acteurs) → suite du flux 5.3, étape 6

Postconditions : décision motivée, deux acteurs distincts si requis, entièrement journalisée.
```

### 5.6 Import de masse

```
Flux : Import d'inscrits
Déclencheur : une organisation vérifiée téléverse un fichier CSV ou Excel
Préconditions : organisation KYC 2 ; fichier ≤ 10 000 lignes ; antivirus clean

1. Lecture des en-têtes ; proposition de correspondance (mémorisée de l'import précédent)
2. L'utilisateur ajuste et valide la correspondance
3. Passe 1, à blanc : validation de chaque ligne par le schéma partagé, détection des doublons
   (base et fichier) ; aucune écriture
4. Rapport de la passe 1 présenté : lignes valides, erreurs ligne par ligne, doublons
5. Confirmation explicite de l'utilisateur
   - Sans confirmation : rien n'est écrit, l'import expire
6. Passe 2, en file : création des profils valides en DECLARED, OZ ID réservé pour chacun,
   référence de l'import conservée, progression publiée en temps réel
7. Si archive ZIP de photos : appariement par nom de fichier → flux 5.4 pour chaque photo
8. Rapport final téléchargeable ; notification de fin
9. Pendant 72 h, annulation possible en une opération :
   suppression logique de tout ce que l'import a créé, OZ ID conservés comme réservés,
   rattachements et documents retirés, audit

Postconditions : chaque ligne du fichier est comptée exactement une fois (acceptée, rejetée ou
doublon) ; les mineurs importés ne sont pas publiés sans tuteur vérifié.
```

### 5.7 Connexion et rotation des jetons

```
Flux : Session
Déclencheur : connexion ou rafraîchissement du jeton d'accès

1. Connexion : vérification du mot de passe (Argon2id) et, si requise, du code TOTP
   - Échec : délai exponentiel ; réponse identique que le compte existe ou non
2. Émission d'un jeton d'accès (15 min) et d'un jeton de rafraîchissement d'une nouvelle famille
3. Rafraîchissement : le jeton présenté est consommé et remplacé
   - Si le jeton présenté est déjà consommé : révocation de toute la famille, alerte de sécurité
4. Nouvelle connexion depuis un appareil inconnu : notification de sécurité

Postconditions : à tout instant, au plus un jeton de rafraîchissement valide par famille.
```

### 5.8 Recherche et consultation d'un profil

```
Flux : Recherche
Déclencheur : un utilisateur autorisé lance une recherche
Préconditions : rôle autorisé à rechercher ; quota du palier non épuisé

1. Le serveur relit en base le rôle, le niveau KYC et le palier du demandeur
2. Les filtres sont validés par schéma ; la requête applique les politiques CASL et la RLS
3. Si le demandeur est recruteur ou agence sans KYC 3 : exclusion de tout mineur dans la requête
4. Résultats paginés par curseur, sérialisés selon la vue du rôle
5. Consultation d'une fiche : sérialisation par vue ; si mineur et recruteur/agence → audit
6. Export : quota décompté, fichier filigrané au nom du demandeur

Postconditions : le demandeur n'a reçu aucun champ hors de sa vue ; chaque consultation de
mineur est journalisée.
```

### 5.9 Certification d'une performance en centre (Phase 2)

```
Flux : Session de test en centre
Déclencheur : un évaluateur ouvre une session
Préconditions : compte centre KYC 3, 2FA active

1. Ouverture de la session : lieu, date (serveur), évaluateur
2. Pour chaque mesure : scan du QR de l'OZ ID → saisie
   - Hors bornes de l'Annexe E : refus
   - Extrême (5 %) ou > 3 écarts-types de l'historique : acceptée, marquée À CONFIRMER
3. Clôture : calcul du hash de l'ensemble des mesures + identifiant évaluateur + horodatage serveur
4. Session signée, mesures en CERTIFIÉ (CENTRE) ; les À CONFIRMER partent en revue OZ
5. Toute correction ultérieure crée une révision journalisée

Postconditions : mesures immuables, signées, attribuées sans erreur de saisie d'identifiant.
```

### 5.10 Export des données et suppression de compte

```
Flux : Droits RGPD
Déclencheur : un utilisateur (ou le tuteur pour un mineur) demande l'export ou la suppression

1. Ré-authentification obligatoire
2. Export : génération asynchrone d'une archive de toutes ses données personnelles,
   disponible par URL signée, notification
3. Suppression : délai de rétractation [À CONFIRMER : durée], puis anonymisation de toute
   donnée personnelle, purge des documents, révocation de toutes les sessions
4. L'OZ ID reste réservé à vie ; les agrégats anonymes sont conservés ; le journal d'audit
   conserve les entrées avec acteur pseudonymisé

Postconditions : zéro donnée personnelle identifiable ; OZ ID non réattribuable.
```

---

## 6. Gestion des erreurs

### 6.1 Philosophie

- **Ne jamais perdre le travail de l'utilisateur.** Les formulaires longs sauvegardent chaque étape côté serveur ; une coupure réseau ne coûte qu'une étape au plus.
- **Guider l'utilisateur, refuser l'attaquant.** Un message d'erreur de saisie est précis et en français ; une erreur de sécurité est générique et ne révèle rien.
- **Échouer bruyamment sur l'intégrité.** Toute incohérence de données sensibles (chaîne d'audit cassée, transition interdite, double OZ ID) arrête l'opération et alerte.
- **Escalader plutôt que décider à tort.** Dans le doute, un dossier part en revue humaine.

### 6.2 Erreurs d'utilisateur

| Erreur | Réponse du système |
|---|---|
| Champ invalide (format, borne) | C1 : message immédiat sous le champ ; C2 : 422 avec détail par champ |
| Date de naissance hors 6-45 ans | 422, message explicite ; aucune création |
| Mineur sans tuteur | Inscription possible, profil non publiable, rappel à chaque connexion |
| Document illisible | Rejet motivé avec consigne (lumière, cadrage), resoumission possible |
| Écart déclaratif / OCR | Pas de rejet ; revue humaine avec l'écart signalé |
| Import : lignes en erreur | Rapport ligne par ligne en passe à blanc ; rien n'est écrit |
| Fichier trop lourd ou type non accepté | 413 / 415, message clair avant téléversement si possible |
| Performance aberrante | Saisie acceptée, marquée `À CONFIRMER` |
| Performance hors bornes physiologiques | Saisie refusée avec la borne rappelée |
| Quota épuisé | 429, indication du palier et de la remise à zéro |
| Session expirée | Rafraîchissement transparent ; sinon retour à la connexion sans perte du formulaire |

### 6.3 Erreurs de sécurité

| Erreur | Réponse du système |
|---|---|
| Identifiants invalides | Réponse identique compte existant ou non ; délai exponentiel |
| Rôle non autorisé | 403, jamais de données partielles ; audit si la cible est un mineur |
| Réutilisation de jeton de rafraîchissement | Révocation de la famille, déconnexion, notification |
| Fichier infecté | Rejet, suppression, alerte sécurité haute |
| Signature de téléversement ou d'URL invalide | 403, journalisé |
| Anti-bot défaillant | Refus générique ; score de risque incrémenté |
| Pic d'inscriptions anormal | Alerte fraude ; possibilité de gel des inscriptions |

### 6.4 Erreurs système

| Erreur | Réponse du système |
|---|---|
| Base indisponible | 503 avec `requestId`, alerte critique ; aucune écriture partielle (transactions) |
| File BullMQ saturée | Les jobs restent en file ; mise à l'échelle des workers au seuil du §10.3 |
| Échec d'un fournisseur externe (SMS, email, OCR, paiement) | Reprise avec délai exponentiel ; au-delà, statut « en attente » visible et alerte |
| Échec antivirus | `av_status = error`, document jamais accessible, nouvelle tentative |
| Chaîne d'audit incohérente | Alerte critique ; opérations sensibles gelées jusqu'à investigation |
| Webhook de paiement dupliqué | Traitement idempotent ; aucun double effet |
| Toute erreur 5xx | Format normalisé, `requestId`, remontée Sentry, aucune donnée personnelle dans le message |

---

## 7. Stratégie de tests

### 7.1 Pyramide (§11.1)

| Niveau | Outil | Part | Cible |
|---|---|---|---|
| Unitaire | Vitest | ~70 % | Logique pure de `packages/core` : OZ ID, checksum, âge, minorité, score de risque, aiguillage, complétude, bornes physiologiques |
| Propriétés | Vitest + `fast-check` | Inclus dans l'unitaire | Propriétés CP-01, 04, 06, 08, 17, 18, 23, 26, 29, 30 |
| Intégration | Supertest + Testcontainers | ~25 % | Endpoints sur PostgreSQL réel : RLS, transactions, matrice de rôles, audit |
| Contrat | Vitest | Continu | Concordance formulaires ↔ schémas `contracts` |
| Bout en bout | Playwright | ~5 % | Les 10 parcours du §11.2 |
| Charge | k6 | Par phase | 200 utilisateurs simultanés ; p95 < 300 ms |
| Sécurité | OWASP ZAP + revue | Par phase | Grille du §6.4 |
| Accessibilité | axe-core + Lighthouse | Continu | AA sur parcours publics |

### 7.2 Tests de propriétés

Les règles les plus critiques sont testées sur des entrées **générées**, pas seulement sur des exemples :

- **OZ ID** : génération aléatoire → checksum toujours valide ; altération aléatoire d'un caractère → toujours détectée ; aucun caractère interdit.
- **Aiguillage KYC** : pour tout score 0-100 et tout type de sujet, un mineur n'est jamais décidé automatiquement ; le quatre-yeux s'applique toujours aux sujets listés.
- **Machine à états** : séquences aléatoires de transitions → seules celles du graphe sont acceptées, chacune avec une entrée d'audit.
- **Chaîne d'audit** : suites aléatoires d'entrées, puis altération ou suppression aléatoire → toujours détectée.
- **Import** : fichiers aléatoires « sales » (colonnes manquantes, encodages, dates ambiguës, doublons) → acceptées + rejetées + doublons = total.
- **Sérialisation** : pour tout rôle et tout profil généré, le payload ne contient que les champs de la vue.

### 7.3 Matrice de rôles

Une suite générée à partir de `docs/security/rbac.md` teste **chaque couple (rôle, endpoint)** : code HTTP attendu et champs présents. Une PR ajoutant un endpoint sans entrée dans la matrice échoue (EX-104 n° 6).

### 7.4 Données de test (§11.3)

`packages/testing` fournit des factories déterministes : 10 000 joueurs répartis par âge, pays et poste ; 50 organisations de chaque type (6 types) ; tuteurs rattachés aux mineurs ; 20 dossiers KYC frauduleux préparés (document altéré, selfie d'écran, doublon, incohérence de date) ; fichiers d'import volontairement sales.

> Un système anti-fraude qui n'est testé que sur des cas honnêtes n'est pas testé.

### 7.5 Parcours E2E obligatoires en Phase 1 (§11.2)

1. Joueur majeur → KYC 2 → badge vérifié
2. Joueur mineur → blocage sans tuteur → tuteur vérifié → publication
3. Académie → import de 100 joueurs → rapport → annulation
4. Recruteur non vérifié → recherche → aucun mineur visible
5. Recruteur KYC 3 → recherche multicritère → consultation → journalisation vérifiée
6. Administrateur → file KYC → décision quatre yeux sur un mineur
7. Réinitialisation de mot de passe complète
8. Réutilisation d'un refresh token → révocation de la famille
9. Export des données → suppression de compte → anonymisation vérifiée
10. Téléversement d'un fichier infecté → rejet + alerte

### 7.6 Seuils (R6)

80 % domaine et services · 70 % global · 100 % authentification, KYC, facturation — bloquants en CI.

---

## 8. Direction UI/UX — brief pour l'expert design

> **Objet :** donner à l'expert UI/UX (lots 0.10 et 1.5) une direction claire, extraite des maquettes du dossier `EX CHART/` et du Document de Projet (DP §12). Les couleurs ci-dessous ont été **échantillonnées au pixel** dans les maquettes, pas estimées à l'œil. Les valeurs marquées ≈ (rayons, tailles) sont mesurées sur des captures et sont à reprendre dans l'outil de design.

### 8.1 Les sources

| Fichier | Contenu | Usage |
|---|---|---|
| `PHOTO-2026-10-21-03-35-54.jpg` / `…08-06-16-00-02.jpg` | Affiche de marque « OZ FOOTBALL ID — The Global Football Talent Network » | Registre **Émotion** : marketing, site public |
| `PHOTO-2026-08-06-16-00-01.jpg` | Planche produit : 5 écrans mobiles + dashboard web recruteur | Composants data (scores, radar, listes, chat) |
| `PHOTO-2026-08-31-11-22-58 2.jpg` | Écrans 01 splash et 02 choix du type de compte, annotés | Registre **Pilotage**, onboarding |
| `PHOTO-2026-08-31-11-22-58.jpg` | Écrans 03 identité et 04 OTP, annotés | Formulaires, états |
| `PHOTO-2026-08-31-11-22-58 3.jpg` | Écrans 05 tuteur et 06 carte OZ ID, annotés | Couleur du cadre légal, seul halo décoratif |
| `PHOTO-2026-08-31-11-22-46.jpg` | Arborescence et routes de l'app + onglets par rôle | Architecture d'information (§8.8) |

Les **planches annotées** (31 août, numérotées 01-06) sont la référence de conception : elles appliquent déjà les règles du plan technique. Les **visuels marketing** (6 août, 21 oct.) donnent l'ambiance de marque mais contiennent des écarts à corriger (§8.10).

### 8.2 Concept : un système, deux registres

Le DP §12.2 décrit deux univers — **doré et sombre** (émotion, joueur, « Ton talent, notre mission ») et **vert et sombre** (institutionnel, donnée, « Le système d'exploitation du football ») — et recommande de converger vers **un système unique capable d'exprimer les deux registres selon la surface**. Les maquettes réalisent déjà cette convergence ; la direction proposée la formalise :

| | **Registre Émotion** | **Registre Pilotage** |
|---|---|---|
| Où | Site public, landing par profil, splash, carte OZ ID, en-tête du profil joueur, stores, réseaux | Formulaires, KYC, recherche, tableaux de bord, back-office, mobile au quotidien |
| Fond | Photo de joueurs, éclairage de stade, bokeh, globe | Noir quasi pur, surfaces légèrement teintées de vert |
| Vert | **Lime néon** `#81F000` (titres accrochés, CTA marketing) | **Émeraude** `#35D468` (actions, états validés) |
| Or / ambre | Liserés métalliques, distinctions (Premium, Élite, Vérifié+) | Uniquement le badge de niveau KYC exigé |
| Effets | Glow, halos, verre dépoli, lumière | Aucun dégradé décoratif sauf le halo de la carte OZ ID |
| Typo | Display italique extra-grasse, très serrée | Grotesque grasse serrée pour titres, régulière pour le corps |

**Règle d'or :** le registre Émotion ne descend jamais dans un écran où l'utilisateur saisit une donnée ou prend une décision. La confiance s'y lit dans la sobriété.

### 8.3 Palette — jetons extraits

| Jeton | Hex | Origine (maquette) | Usage | Contraste sur `bg` |
|---|---|---|---|---|
| `bg` | `#070707` | Fond des écrans 03-06 | Fond d'application | — |
| `bg-page` | `#090909` | Fond des planches | Fond web hors cartes | — |
| `surface-1` | `#0C0E0D` | Panneau des routes | Panneaux, sidebar | — |
| `surface-2` | `#10120F` | Encadré OTP, carte d'avertissement | Cartes, encadrés | — |
| `surface-input` | `#171C16` | Champs de formulaire | Champs, boutons désactivés (`#161C15`) | — |
| `surface-ozid` | `#141E16` | Carte OZ ID | Carte d'identité, cartes héros | — |
| `tint-green` | `#0D2517` | Tuile d'icône (écran 04) | Fond des tuiles d'icônes | — |
| `border` | `#131716` → `#1E2221` | Bordures de cartes | Séparateurs, contours au repos | — |
| `text` | `#F2F4F1` | Titres | Texte principal | 18,2 |
| `text-muted` | `#8C8E8B` | Sous-titres | Texte secondaire | 6,1 ✅ |
| `text-label` | `#818680` | Libellés « PRÉNOM » | Libellés majuscules | 5,4 ✅ |
| `text-disabled` | `#4A4F49` | Bouton « Vérifier » inactif | Uniquement texte désactivé | 2,4 (dérogation WCAG admise pour l'inactif) |
| `primary` | `#35D468` | Centre du bouton principal | Action, état validé, progression | 10,3 ✅ |
| `primary-from` → `primary-to` | `#3BE06A` → `#2CC45A` | Dégradé du bouton « Continuer » | Bouton principal actif uniquement | Texte `#06120A` : 9,8 ✅ |
| `primary-bright` | `#41DD6A` / `#49E86F` | Pastille de sélection, coche | Coches, focus vif | — |
| `on-primary` | `#06120A` | Texte du bouton vert | Texte sur vert | — |
| `lime` | `#81F000` (`#7EE62B` UI) | « Talent », CTA de l'affiche | Registre Émotion seulement | 12,7 ✅ |
| `legal` (bleu tuteur) | `#3B64F1` (icône), `#4971E4` (texte maquette) | Écrans 02, 05, routes | Tout ce qui relève du tuteur et du cadre légal | 4,6 ⚠️ |
| `legal-text` | **`#6B8EF0`** *(correction proposée)* | — | Texte bleu de petite taille | 6,5 ✅ |
| `legal-bg` / `legal-border` | `#0A111C` / `#222A37` | Encadré « Vous êtes mineur » | Encadrés légaux | — |
| `kyc` (ambre) | `#C89137` (bordure `#3F3923`) | Badges « KYC 3 », « KYC 1/3 » | Niveau de vérification exigé ou atteint | 7,3 ✅ |
| `danger` | `#E5484D` *(proposé, la maquette n'a que du rouge antialiasé `#991932`)* | « bloquant » (routes) | Étape bloquante, erreur, signalement | 5,2 ✅ |
| `admin` | `#D29847` | Onglet « ADMIN OZ » | Repère du back-office | — |
| `observer` | `#8C8E8B` | Onglet « FÉDÉRATION » | Mode observateur, lecture seule | — |

**Écart corrigé :** le bleu des maquettes `#4971E4` ne passe pas AA en petit texte (4,6 sur fond, 3,9 sur champ). Garder `#3B64F1` pour les icônes et grands titres, utiliser `#6B8EF0` pour le texte.

Jetons prêts à poser dans `packages/ui` :

```css
:root {
  --oz-bg: #070707;          --oz-bg-page: #090909;
  --oz-surface-1: #0C0E0D;   --oz-surface-2: #10120F;
  --oz-surface-input: #171C16; --oz-surface-ozid: #141E16;
  --oz-tint-green: #0D2517;  --oz-border: #1E2221;
  --oz-text: #F2F4F1;        --oz-text-muted: #8C8E8B;
  --oz-text-label: #818680;  --oz-text-disabled: #4A4F49;
  --oz-primary: #35D468;     --oz-primary-from: #3BE06A; --oz-primary-to: #2CC45A;
  --oz-primary-bright: #49E86F; --oz-on-primary: #06120A;
  --oz-lime: #81F000;
  --oz-legal: #3B64F1;       --oz-legal-text: #6B8EF0;
  --oz-legal-bg: #0A111C;    --oz-legal-border: #222A37;
  --oz-kyc: #C89137;         --oz-kyc-border: #3F3923;
  --oz-danger: #E5484D;      --oz-admin: #D29847;
}
```

### 8.4 Sémantique des couleurs — règles tirées des annotations

1. **Le vert ne s'allume que lorsque l'action est réellement possible.** Bouton inactif : fond plat `surface-input`, texte `text-disabled`, aucun dégradé (annotation écran 04).
2. **Le bleu — et non le vert — marque tout ce qui relève du tuteur et du cadre légal.** Le joueur doit distinguer d'un coup d'œil ce qui le concerne de ce qui le protège (annotation écran 05). Étiquette « ÉTAPE BLOQUANTE · MINEUR » en bleu, encadré mineur en bleu.
3. **L'ambre annonce un niveau de vérification**, exigé (« KYC 3 » sur le choix du compte) ou atteint (« KYC 1/3 » sur la carte). Il apparaît **avant** la saisie, jamais découvert au dernier écran (annotation écran 02).
4. **Le rouge est réservé au bloquant et au danger** : étape bloquante, rejet, signalement, erreur.
5. **Une couleur par rôle** dans la navigation (planche des routes) : vert (joueur, recruteur, académie, centre), bleu (tuteur), gris (fédération, observateur), orange (admin OZ).
6. **Badge « Vérifié » :** pastille verte avec bouclier ou coche ; affiché **uniquement** après confirmation serveur (CP-19). « Vérifié+ » (KYC 3) : variante or proposée, à valider (Q6).

### 8.5 Typographie

| Rôle | Observé | Proposition (licence OFL, à faire passer par R12) |
|---|---|---|
| Logo / display marketing | Italique extra-grasse très serrée « OZ », « FOOTBALL ID » espacé | Logo à vectoriser par le designer ; display : **Archivo Black / Archivo ExtraBold Italic** |
| Titres d'écran | Grotesque grasse, interlettrage négatif (« Votre identité », « Le réseau mondial… ») | **Inter Tight** 700-800, `letter-spacing: -0.03em` |
| Corps | Grotesque régulière lisible | **Inter** 400-500, 15-16 px mobile |
| Libellés | Majuscules petites, espacées, gris (« PRÉNOM », « PASSEPORT NUMÉRIQUE CRÉÉ ») | Inter 600, 11-12 px, `letter-spacing: 0.08em`, `text-label` |
| OZ ID, codes, routes | Chasse fixe, vert, grasse et espacée | **JetBrains Mono** 600, `letter-spacing: 0.05em` |
| Chiffres (scores, mesures) | Grasse, tabulaire | Inter Tight avec `font-variant-numeric: tabular-nums` |

Polices auto-hébergées et sous-ensemblées (latin + latin-ext) : connexion faible (EX-T22).

### 8.6 Composants observés

| Composant | Spécification relevée | Maquette |
|---|---|---|
| Bouton principal | ≈ 52-56 px de haut, rayon ≈ 14 px, dégradé `primary-from → primary-to` diagonal, texte `on-primary` gras | 02-06 |
| Bouton secondaire | Fond transparent, contour 1 px `#363636`, texte blanc | 01, 06 |
| Bouton désactivé | Fond plat `surface-input`, texte `text-disabled` | 04 |
| Champ | Fond `surface-input`, rayon ≈ 12 px, sans bordure au repos ; libellé majuscule au-dessus | 03, 05 |
| Champ focus | Contour 1,5 px vert (`#68C57C` → `primary`) ; méta-info alignée à droite en vert (« 17 ANS ») | 03 |
| Barre de progression | Fine (≈ 3 px), piste `#1D1F1E`, remplissage `primary`, compteur « 2 / 5 » à droite, retour à gauche | 02-05 |
| Cases OTP | 6 cases ≈ 52 px, `surface-2`, case active contour vert + curseur ; minuteur « Renvoyer dans 42 s » en vert | 04 |
| Carte de choix | `surface-2`, rayon ≈ 14 px, tuile d'icône à gauche ; sélectionnée : contour vert + pastille cochée verte | 02 |
| Tuile d'icône | Carré arrondi ≈ 44-56 px, fond `tint-green`, icône trait vert | 02, 04 |
| Encadré d'information | `surface-2` ou `legal-bg`, contour fin, icône à gauche, texte `text-muted` avec passages en gras | 03, 04, 05, 06 |
| Liste à coches | Coches vertes fines + texte | 05 |
| Badge statut | Pilule à contour fin et texte couleur sémantique (vert vérifié, ambre KYC, bleu légal) | 02, 05, 06 |
| Carte OZ ID | `surface-ozid`, rayon ≈ 16 px, avatar, nom, poste/âge/pays/pied, séparateur, OZ ID en mono vert, QR sur fond vert, badge KYC | 06 |
| Anneau de score | Cercle à trait vert progressif autour d'un chiffre | Planche produit |
| Radar 6 axes | Hexagone, remplissage vert translucide, nœuds lumineux | Planche produit |
| Barres d'attributs | Barre horizontale verte, valeur à droite, pourcentage en petit | Planche produit |
| Puces de filtre | Pilules ; active : fond vert plein, texte foncé ; filtres appliqués avec « × » | Planche produit |
| Pagination de carrousel | Points ; actif = pilule allongée verte | 01 |
| Barre d'onglets | 5 onglets, icône + libellé, actif vert, pastille de notification rouge | Planche produit |

### 8.7 Effets et animations

Les effets sont la signature d'OZ, mais ils doivent tenir sur un téléphone d'entrée de gamme en 3G. Trois règles avant le catalogue :

- **Budget :** uniquement `transform` et `opacity` animés (GPU), aucune bibliothèque d'animation lourde en Phase 1 (CSS + Web Animations API) ; aucun effet ne retarde l'accès au contenu.
- **`prefers-reduced-motion` :** chaque effet a un repli statique, testé.
- **Les effets suivent la vérité serveur :** une animation de succès (badge, certification) ne joue **qu'après** la réponse du serveur (CP-19). Jamais d'optimisme sur un statut de confiance.

| # | Effet | Où | Spécification | Registre | Repli |
|---|---|---|---|---|---|
| E1 | **Halo vert** derrière la carte OZ ID | Écran 06, partage de carte | Dégradé radial `primary` à 12-18 % d'opacité → transparent, diffus ; « respiration » lente (échelle 1 → 1,04, 4 s, en boucle) | Émotion — **seul dégradé décoratif du parcours** | Halo fixe |
| E2 | **Révélation de l'OZ ID** | Fin d'inscription | Carte qui monte (translateY 24 → 0, opacity 0 → 1, 500 ms ease-out), puis OZ ID tapé caractère par caractère en mono (≈ 40 ms/caractère), QR en fondu | Émotion | Affichage direct |
| E3 | **Dégradé du bouton principal** | Partout | `linear-gradient(135deg, #3BE06A, #2CC45A)` ; au survol / appui : légère montée de luminosité + ombre portée verte `0 8px 24px rgb(53 212 104 / 0.25)` ; appui : scale 0,98, 100 ms | Pilotage | Sans ombre |
| E4 | **Activation du vert** | Bouton qui devient actif | Transition 200 ms du fond plat vers le dégradé quand le formulaire devient valide | Pilotage | Bascule instantanée |
| E5 | **Focus de champ** | Formulaires | Contour vert 1,5 px en 150 ms ; méta-info (« 17 ANS ») en fondu à droite | Pilotage | Contour seul |
| E6 | **Apparition du bloc mineur** | Écran 03 → 05 | Encadré bleu qui se déplie (hauteur + opacité, 250 ms) dès que l'âge calculé < 18 | Pilotage (bleu légal) | Apparition directe |
| E7 | **Progression d'étape** | Barre d'onboarding | Largeur animée 300 ms ease-out ; compteur qui change | Pilotage | Saut |
| E8 | **Case OTP active** | Écran 04 | Curseur clignotant vert, contour actif qui glisse d'une case à la suivante ; erreur : secousse horizontale (3 × 4 px, 300 ms) + contour rouge | Pilotage | Contour seul |
| E9 | **Sélection de carte** | Écran 02 | Contour vert + pastille cochée en « pop » (scale 0,6 → 1, ressort léger, 200 ms) | Pilotage | Coche statique |
| E10 | **Anneau de score** | Profils, listes | Trait qui se dessine (`stroke-dashoffset`) en 800 ms ease-out, chiffre qui compte de 0 à la valeur en même temps ; déclenché à l'entrée dans l'écran | Pilotage | Valeur finale directe |
| E11 | **Radar de performance** | Tests (Phase 2) | Polygone qui s'étire du centre (scale 0 → 1, 600 ms), nœuds avec léger glow vert (`drop-shadow` 4 px) | Pilotage | Radar statique |
| E12 | **Barres d'attributs / mesures** | Profil, tests | Largeur de 0 à la valeur en 500 ms, décalage 60 ms entre barres | Pilotage | Barres pleines |
| E13 | **Badge « Vérifié »** | Profil, résultats | Apparition en tampon (scale 1,15 → 1 + fondu, 300 ms), **uniquement après confirmation serveur** | Pilotage | Badge statique |
| E14 | **Squelettes de chargement** | Listes, profils | Blocs `surface-2` avec balayage lumineux lent (1,5 s) ; préférés aux spinners en 3G | Pilotage | Blocs fixes |
| E15 | **Pagination du splash** | Écran 01 | Point actif qui s'étire en pilule (largeur 8 → 20 px, 250 ms) | Émotion | Saut |
| E16 | **Cercle central du terrain** | Splash | Cercles fins concentriques à très faible opacité, rotation imperceptible (60 s/tour) | Émotion | Fixe |
| E17 | **Néon lime** | Marketing, landing | Texte et CTA lime avec `text-shadow`/`box-shadow` lime diffus (0 0 24 px à 35 %) | Émotion uniquement | Sans glow |
| E18 | **Verre dépoli** | Panneaux marketing (« Why OZ is different », stats) | Fond noir à 55-70 % + `backdrop-filter: blur(16px)`, contour 1 px blanc à 8 % | Émotion uniquement (coûteux en GPU) | Fond opaque `surface-1` |
| E19 | **Carte d'Afrique lumineuse** | Landing, dashboard fédération | Points verts lumineux par pays, pulsation lente sur les pays actifs | Émotion / tableau de bord | Carte statique |
| E20 | **Puces pays flottantes** | Affiche, hero du site | Petites étiquettes drapeau + pays qui flottent (translateY ±4 px, 6 s, déphasées) | Émotion | Fixes |
| E21 | **Lumière de stade et bokeh** | Hero, splash marketing | Photo traitée, faisceaux de projecteurs, particules floues ; image optimisée (AVIF/WebP, < 120 Ko en mobile) | Émotion | Image fixe |
| E22 | **Cadres métalliques or** | Mises en scène des téléphones (stores, marketing) | Liseré dégradé or-bronze sur les maquettes de device | Émotion (lien avec la direction « dorée » du DP §12.2) | — |

**Interdits :** pas d'effet sur une donnée de mineur qui la rende plus visible (pas de mise en avant animée d'un profil mineur) ; pas d'animation de célébration avant décision serveur ; pas de verre dépoli ni de néon dans les formulaires, le KYC ou le back-office.

### 8.8 Architecture d'information (planche des routes)

La planche `PHOTO-2026-08-31-11-22-46.jpg` fixe la structure de l'app (React Native, même API REST que le web), cohérente avec les exigences :

- **(public)** `/splash` (01) · `/auth/role` (02, 7 types de compte) · `/auth/signup/player` (03) · `/auth/signup/org` (6 types d'organisation) · `/auth/otp` (04) · `/auth/login`, `/auth/reset` · `/legal/cgu`, `/legal/confidentialite`
- **(onboarding)** — **bloquant** : `/onboarding/identite` · `/onboarding/tuteur` (05, mineur) · `/onboarding/physique` · `/onboarding/oz-id` (06)
- **(kyc)** `/kyc` (07, niveaux 0→3) · `/kyc/document/[type]` (08) · `/kyc/analyse` (09) · `/kyc/refus/[id]` (10) · `/kyc/succes` (11)
- **(tabs)** `/accueil` (12, par rôle) · `/recherche` (13-15) · `/messages` (25-26) · `/profil` · `/plus`
- **(joueur)** `/joueur/[ozid]?vue=apercu|stats|videos|tests|carriere` (17-21) · `/restreint` (18, mineur) · `/bloque` (16, KYC 3 requis) · `/journal` (20, vu par le tuteur)
- **(performance)** — Phase 2 : `/performance/session/scan` (22, QR OZ ID) · `/performance/session/[id]` (23) · `/performance/progression` (24, cohorte) · `/performance/soumettre` (source B)
- **(gestion)** `/shortlist` (27) · `/rapports/[id]` (28) · `/academie/effectif` (29) · `/academie/import` (30, CSV 10 000 lignes) · `/abonnement` (31, mobile money) · `/admin/kyc/file` (32, quatre yeux) · `/federation/observateur`

**Onglets par rôle :** Joueur (Accueil · Recherche · Messages · Profil · Plus) · Recruteur (Accueil · Recherche · Messages · Shortlist · Plus) · Académie (Effectif · Import · Messages · Rapports · Plus) · Tuteur (Consentements · Journal de consultation · Signalement) · Centre OZ (Scan QR · Session · Saisie · Clôture signée) · Fédération (Observateur : lecture seule, agrégats, aucun contact) · Admin OZ (File KYC · Quatre yeux · Audit · Signalements 48 h).

**Règle de la planche, alignée sur R4 :** les garde-fous sont appliqués côté serveur ; une route interdite renvoie **404, pas un écran masqué**.

### 8.9 Règles d'expérience (annotations + DP §12)

1. **Cinq étapes courtes, une seule question par écran quand c'est possible.** L'inscription est l'endroit où l'on perd un joueur de 16 ans sur connexion faible.
2. **La minorité est détectée à la saisie de la date de naissance et annoncée immédiatement**, pas à la fin du parcours.
3. **Le niveau de KYC exigé est annoncé avant la saisie.**
4. **Ce que le tuteur contrôlera est listé explicitement** : publication et visibilité, journal des consultations, toute prise de contact (jamais directe), retrait du consentement.
5. **Le splash se découvre sans compte** : quatre volets (le réseau, la vérification, la performance, la mise en relation).
6. **La confiance visible** (DP §12.1) : statuts et badges lisibles d'un coup d'œil, distinction nette « certifié centre / certifié soumis / non certifié ».
7. **Cohérence entre surfaces** (DP §12.3) : mobile, web et back-office partagent jetons, typographie et composants (`packages/ui`).
8. **Français par défaut**, libellés pensés pour des utilisateurs peu familiers du numérique ; anglais préparé.

### 8.10 Écarts relevés dans les maquettes (à corriger avant implémentation)

| # | Écart | Règle concernée | Correction demandée |
|---|---|---|---|
| M1 | OZ ID affiché `OZ-CM-08-4K7X2` (5 caractères, sans checksum, « 08 » ambigu) | EX-102, §5.3 du plan | Format `OZ-CM-26-7K4M9Q-3` (Q17) |
| M2 | « OZ Score / OZ Index » (85-92) sur les écrans de recherche, profil, radar | EX-303 (Phase 3), mineurs | Retirer ou remplacer par des mesures certifiées brutes jusqu'à décision (Q18) |
| M3 | Joueurs de 16-17 ans (mineurs) mis en avant dans « Top players this week » et notés | EX-T16 n° 2 et n° 9 | Aucun classement public de mineurs ; visibles uniquement aux rôles autorisés |
| M4 | Logos FIFA, CAF, Puma, Turkish Airlines, MTN sur l'affiche | Droit des marques | Retirer tant qu'aucun partenariat n'est signé |
| M5 | Chiffres « 128 450 joueurs vérifiés », « 54 pays » | Confiance, DP §3.5 | Ne jamais afficher de chiffre fictif comme réel ; compteurs branchés sur la base |
| M6 | Nom « FOOTBALL ID » (affiches) vs « FOOTBALL OS » / « OZ4 » (écrans) | Cohérence de marque | Arbitrage (Q19) |
| M7 | Écrans marketing en anglais (« Sign up », « Log in ») | Français par défaut | Français, anglais en option |
| M8 | Bleu `#4971E4` sous AA en petit texte | EX-T22 | `#6B8EF0` pour le texte |
| M9 | Fautes dans la planche marketing (« Centrapn », « identty ») | Qualité | Corriger |

### 8.11 Mission de l'expert UI/UX — livrables

**Lot 0.10 (Phase 0)**
1. Jetons du §8.3 posés dans `packages/ui` (CSS variables + thème Tailwind), en mode sombre natif.
2. Storybook 8 avec les 8 composants de base du plan, dans leurs états (repos, focus, actif, désactivé, erreur, chargement).

**Lot 1.5 (Phase 1)**
3. **ADR d'identité visuelle** : convergence des deux univers du DP §12.2 en deux registres (§8.2), arbitrage de M6 (nom) et de la place de l'or.
4. Bibliothèque complète des composants du §8.6, documentée dans Storybook.
5. Bibliothèque d'effets E1 à E22, chacun avec son repli `prefers-reduced-motion` et une mesure de coût (images/s sur Android d'entrée de gamme).
6. Maquettes des écrans numérotés de la planche des routes nécessaires à la Phase 1 (01-16, 17-21 sans OZ Score, 29-32), corrigées des écarts M1-M9.
7. Audit : WCAG AA (axe-core + Lighthouse ≥ 90 accessibilité), 320 px, 3G simulée (p95 < 2,5 s).

**Critère de sortie :** un développeur peut construire n'importe quel écran de Phase 1 en assemblant uniquement des composants et jetons du Storybook, sans inventer de couleur, de rayon ou d'animation.
