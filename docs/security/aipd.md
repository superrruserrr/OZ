# Analyse d'impact relative à la protection des données (AIPD) — vérification d'identité

> **Statut : brouillon technique, non validé.** Rédigé le 2026-11-03 à partir du plan
> ([PLAN.md](../PLAN.md) §6 et §7), des décisions TD-015 et TD-016, de l'[ADR-008](../adr/ADR-008-conservation-pieces-identite.md)
> et du code livré jusqu'au lot 1.9cb. Il décrit ce que fait le système ; il **n'affirme aucune
> qualification juridique, base légale ou durée légale**. Ces points sont posés comme questions au
> juriste (§9). L'AIPD doit être validée avant le lot 1.10 (EX-T24 n° 6) ; au Québec, elle tient lieu
> d'évaluation des facteurs relatifs à la vie privée (Loi 25, plan §6.8), sous réserve de l'avis du
> juriste.

## 1. Pourquoi une AIPD

Le lot 1.10 introduit la vérification d'identité KYC 2 : pièce d'identité, selfie avec détection de
vivacité, concordance faciale et contrôle de doublon (plan §7.3, §7.4). Ce traitement réunit
plusieurs critères qui, selon les lignes directrices européennes, rendent l'AIPD obligatoire :

| Critère                                   | Situation d'OZ                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Données biométriques (RGPD art. 9)        | Concordance faciale selfie ↔ photo du document, empreinte faciale perceptuelle  |
| Personnes vulnérables                     | Joueurs mineurs dès 6 ans (plan §7.2, C4)                                       |
| Évaluation, notation                      | Score de risque 0-100 (plan §7.4 j)                                             |
| Décision produisant un effet significatif | Obtention ou refus du badge « Profil vérifié », condition de visibilité         |
| Croisement de données                     | Déclaratif ↔ OCR, doublons SHA-256, empreinte du numéro, empreinte perceptuelle |
| Transfert hors UE possible                | Utilisateurs au Cameroun, entité au Québec, recruteurs européens (plan §6.8)    |
| Technologie nouvelle                      | Prestataire de vivacité et de concordance faciale (TD-015)                      |

## 2. Description du traitement

### 2.1 Finalité

Attribuer le badge « Profil vérifié » (KYC 2) et « Vérifié+ » (KYC 3) en prouvant que la personne
existe, qu'elle est celle qu'elle déclare être et que sa date de naissance est exacte. La fraude à
l'âge et à l'identité est le premier risque de la plateforme (plan §6.1, risque 1).

### 2.2 Personnes concernées

Joueurs majeurs et mineurs, tuteurs légaux, dirigeants d'organisation (académie, club, centre),
recruteurs, fédérations (plan §7.3, correspondance par rôle).

### 2.3 Données traitées

| Donnée                                                              | Origine                      | Conservation (état actuel, à valider)                       |
| ------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Pièce d'identité, acte de naissance (image ou PDF)                  | Téléversée par l'utilisateur | Fichier purgé à `retention_until` (90 jours par défaut)     |
| Selfie                                                              | Capturé par l'utilisateur    | Comme la pièce (à confirmer au lot 1.10)                    |
| Extrait OCR (nom, prénom, date de naissance, numéro, émetteur)      | Prestataire KYC              | Chiffré en base, effacé à la purge                          |
| Numéro de document                                                  | OCR                          | Chiffré, effacé à la purge ; seule son empreinte HMAC reste |
| Empreinte SHA-256, empreinte perceptuelle, type, taille, dimensions | Calculées par OZ             | Conservées (preuve, doublons)                               |
| Signaux du prestataire (vivacité, concordance, falsification)       | Prestataire KYC              | À définir au lot 1.10                                       |
| Score de risque, décision, motif, validateurs, horodatage           | OZ et administrateurs        | Conservés (preuve de la vérification, ADR-008)              |
| Journal d'audit des lectures et décisions                           | OZ                           | Conservé (durée à fixer au lot 1.16)                        |

Les données de santé, scolaires et de géolocalisation précise sont exclues (plan §6.7 n° 7).

### 2.4 Cycle de vie

1. **Dépôt** (lot 1.9a) : URL signée à usage unique, envoi direct au stockage, quarantaine.
2. **Analyse** (lot 1.9b) : antivirus ClamAV, type réel, taille, dimensions, ré-encodage des images,
   suppression des métadonnées EXIF, SHA-256 et empreinte perceptuelle.
3. **Vérification** (lot 1.10, à construire) : envoi au prestataire, signaux retournés, score,
   aiguillage, revue humaine.
4. **Lecture** (lot 1.9ca) : URL signée de 5 minutes, fichier sain seulement, chaque lecture journalisée.
5. **Purge** (lot 1.9cb) : suppression du fichier à échéance, marquage `purged_at`, effacement de
   l'extrait OCR et du numéro chiffrés, audit `document.purge.done`.

### 2.5 Acteurs et destinataires

| Acteur                               | Rôle (qualification à confirmer)                             | Accès                                                         |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| OZ                                   | Responsable de traitement (entité à préciser, Q20)           | Administrateurs, revue « quatre yeux » pour les cas sensibles |
| Prestataire KYC (Veriff ou Smile ID) | Sous-traitant, choisi par POC au lot 1.10                    | Images et selfie le temps de l'analyse                        |
| Scaleway (Paris)                     | Sous-traitant : hébergement, base, stockage (TD-009, TD-010) | Données chiffrées au repos                                    |
| Utilisateur, tuteur, organisation    | Déposants                                                    | Leurs propres pièces, selon la matrice RBAC                   |

Les recruteurs, clubs et fédérations **ne voient jamais** les pièces d'identité : ils voient le badge.

## 3. Nécessité et proportionnalité

| Principe     | Mesure dans OZ                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Finalité     | Une seule : prouver l'identité et l'âge pour le badge (§2.1)                                                |
| Minimisation | Le prestataire renvoie des signaux, il ne décide pas (TD-015) ; aucune donnée exclue par §6.7 n° 7          |
| Exactitude   | Concordance déclaratif ↔ OCR ; un écart est escaladé en revue humaine, jamais rejeté seul (§7.2)            |
| Conservation | OZ garde la preuve de la vérification, pas le document (§7.4, ADR-008)                                      |
| Information  | Politique de confidentialité avant l'ouverture des inscriptions [BLOQUANT] (lot 1.6, Q7)                    |
| Consentement | Consentement explicite avant tout selfie, du tuteur pour un mineur (EX-T24 n° 6) — lot 1.10                 |
| Droits       | Accès, rectification, effacement, portabilité (lot 1.16) ; contestation d'une décision automatique (TD-016) |
| Alternative  | Aucune vérification sans biométrie n'atteint la valeur du badge ; à confirmer par le juriste (§9)           |

## 4. Décision automatisée (RGPD art. 22)

Au lancement, **aucune décision KYC n'est prise sur la seule foi de l'IA** (TD-016) :

- le rejet automatique ne repose que sur des faits déterministes (fichier infecté, type incohérent,
  document expiré, image illisible selon des seuils mesurés, âge hors bornes, troisième rejet en
  30 jours) ;
- un signal d'IA seul (vivacité, concordance faciale, falsification) envoie en revue humaine ;
- mineur, tuteur, recruteur, agence et centre : revue humaine systématique par **deux
  administrateurs distincts** (plan §7.4, étape 5) ;
- l'approbation automatique des majeurs reste désactivée (drapeau `kyc.autoApproveAdults`) jusqu'à
  une preuve mesurée (≥ 1 000 décisions humaines, ≥ 99 % de concordance) et une ADR.

## 5. Risques pour les personnes

Échelle : gravité et vraisemblance de 1 (négligeable) à 4 (maximale). Cotation proposée, à discuter.

| #   | Risque                                                                  | Gravité | Vraisemblance avant mesures | Vraisemblance après mesures |
| --- | ----------------------------------------------------------------------- | ------- | --------------------------- | --------------------------- |
| R1  | Fuite des pièces d'identité ou selfies (dont mineurs)                   | 4       | 3                           | 2                           |
| R2  | Accès illégitime interne (administrateur, organisation)                 | 4       | 2                           | 1                           |
| R3  | Réutilisation des données biométriques par le prestataire               | 4       | 2                           | 2 (dépend du POC)           |
| R4  | Refus de badge injustifié (faux négatif d'IA)                           | 3       | 3                           | 1                           |
| R5  | Badge obtenu frauduleusement (usurpation, faux âge)                     | 4       | 3                           | 2                           |
| R6  | Conservation excessive (fichiers, copies de secours, versions d'objets) | 3       | 3                           | 2 (copies à prouver)        |
| R7  | Transfert hors UE non encadré (prestataire, support, utilisateurs)      | 3       | 2                           | 2 (à encadrer)              |
| R8  | Consentement du tuteur absent ou contourné pour un mineur               | 4       | 2                           | 1 (lots 1.7b, 1.10)         |

## 6. Mesures existantes (livrées et testées)

| Mesure                                                                                  | Risques | Lot        | Référence                                                 |
| --------------------------------------------------------------------------------------- | ------- | ---------- | --------------------------------------------------------- |
| Dépôt par URL signée à usage unique, quarantaine, refus de toute clé hors convention    | R1      | 1.9a       | [documents.md](documents.md)                              |
| Antivirus, type réel, ré-encodage, suppression EXIF, SHA-256, empreinte perceptuelle    | R1, R5  | 1.9b       | [documents.md](documents.md)                              |
| Lecture par URL signée de 5 minutes, pièce saine seulement, refus uniforme (404), audit | R1, R2  | 1.9ca      | [documents.md](documents.md)                              |
| Purge à échéance, effacement de l'extrait OCR et du numéro chiffrés, audit              | R1, R6  | 1.9cb      | [ADR-008](../adr/ADR-008-conservation-pieces-identite.md) |
| Chiffrement colonne des champs d'identité, empreinte HMAC du numéro                     | R1, R5  | 1.1, 1.9cb | plan §6.9                                                 |
| Contrôle d'accès par rôle et RLS en base, tests « rôle non autorisé »                   | R2      | 1.4a-b     | [rbac.md](rbac.md)                                        |
| Authentification Argon2id, 2FA, limitation de débit                                     | R2      | 1.3        | [auth.md](auth.md)                                        |
| Hébergement et stockage à Paris (UE)                                                    | R7      | 0.8        | TD-009, TD-010                                            |
| Données de test synthétiques uniquement hors production                                 | R1      | tous       | plan, R10                                                 |

## 7. Mesures prévues (avant ouverture)

| Mesure                                                                                                                                                                    | Risques    | Lot        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| POC prestataire en bac à sable, sans donnée réelle ; critères : DPA données en UE, signaux explicables, **désactivation de la conservation biométrique côté prestataire** | R3, R7     | 1.10       |
| Interface `IdentityVerifier` : réponse validée par schéma, toute réponse inattendue → revue humaine                                                                       | R4         | 1.10       |
| Consentement explicite horodaté avant le selfie, du tuteur pour un mineur                                                                                                 | R8         | 1.7b, 1.10 |
| Quatre yeux pour mineurs, tuteurs, recruteurs, agences et centres                                                                                                         | R2, R4, R5 | 1.10, 1.11 |
| Preuve par test que la purge couvre les versions d'objets et copies de secours                                                                                            | R6         | 1.10       |
| Registre des traitements, procédure d'exercice des droits, notification d'incident sous 72 h                                                                              | R1, R7     | 1.16       |
| Accords de sous-traitance (DPA) avec chaque prestataire                                                                                                                   | R3, R7     | 1.10, 1.18 |
| Politique de confidentialité et CGU publiées [BLOQUANT]                                                                                                                   | tous       | 1.6        |

## 8. Risques résiduels

Après mesures, aucun risque ne reste à vraisemblance 3 ou 4. Trois dépendent d'éléments encore
ouverts : R3 (choix et contrat du prestataire), R6 (purge des copies de secours), R7 (encadrement des
transferts). Si l'un d'eux restait élevé après le lot 1.10, la consultation préalable de l'autorité
de contrôle (RGPD art. 36) serait à envisager — décision du juriste.

## 9. Questions au juriste

1. Base légale du traitement biométrique (RGPD art. 9.2) : consentement explicite seul, ou autre ?
2. Âge à partir duquel un mineur consent lui-même, selon chaque pays (Cameroun, UE, Québec).
3. Durée de conservation des fichiers : 90 jours proposés (ADR-008, Q9). **Écart à trancher** : le
   code compte 90 jours **à partir du dépôt**, l'ADR-008 dit 90 jours **après la décision**.
4. Durée de conservation de la preuve (décision, empreintes, audit) et du journal d'audit.
5. Encadrement des transferts : prestataire, support, entité au Québec, utilisateurs au Cameroun.
6. Entité responsable de traitement (Q20) et désignation d'un responsable de la protection des
   renseignements personnels (Loi 25).
7. Obligations déclaratives auprès de l'autorité camerounaise compétente.
8. Cette AIPD vaut-elle évaluation des facteurs relatifs à la vie privée au sens de la Loi 25 ?

## 10. Validation

| Rôle                | Nom             | Avis | Date |
| ------------------- | --------------- | ---- | ---- |
| Rédacteur technique | Gaëtan Wassu    |      |      |
| Juriste             | À désigner (Q7) |      |      |
| Porteur produit     | Fabrice Olinga  |      |      |

Révision obligatoire au choix du prestataire (lot 1.10), avant l'ouverture (lot 1.18), puis à tout
changement de prestataire ou d'activation de l'approbation automatique.
