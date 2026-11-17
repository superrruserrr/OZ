# Tuteur légal

Référence : EX-108, lot 1.7b (sous-lots 1.7ba, 1.7bb, 1.7bc). Décisions D1 à D5 validées le
2026-11-16 ; D2 et le sens de l'acceptation révisés pour raison de sécurité et confirmés le
2026-11-17. Décisions R1 à R6 du lot 1.7bb validées le 2026-11-17.

## Invitation et acceptation (lot 1.7ba)

L'inscription d'un joueur mineur (lot 1.7a) crée une fiche `guardians` sans compte : nom, lien
déclaré, contacts chiffrés, statut `declared`.

1. **Invitation.** Le joueur mineur connecté appelle `POST /players/me/guardian/invitation`. Un jeton
   à usage unique est créé ; seule son empreinte SHA-256 est gardée (`guardian_invitations`). Une
   nouvelle invitation annule la précédente, même déjà acceptée (mauvais destinataire). Valable
   7 jours (D5).
2. **Canal (D1).** Si le tuteur a donné une adresse, OZ lui envoie le lien
   (`…/tuteur/invitation#token=…`, jeton dans le fragment). L'email ne cite que le prénom de l'enfant.
   Sans adresse (téléphone seul), le lien est rendu au joueur, une seule fois, pour qu'il le transmette
   lui-même. L'envoi automatique par SMS ou WhatsApp est une dette (D-134).
3. **Aperçu.** `POST /guardians/invitations/read`, sans session : prénom de l'enfant et lien déclaré.
   Ni nom, ni date de naissance, ni OZ ID. Inconnue, expirée, acceptée ou annulée : même réponse 400.
4. **Acceptation : un rattachement en attente.** `POST /guardians/invitations/accept`, compte
   connecté à l'email vérifié, qui n'est ni l'enfant ni un autre joueur mineur. L'acceptation est
   enregistrée sur l'invitation (`accepted_by`) ; deux acceptations concurrentes : une seule réussit.
   **Elle ne pose pas le compte sur la fiche tuteur et n'accorde pas le rôle `guardian`.**
5. **Mes enfants.** `GET /guardians/me/children` liste les enfants mineurs du compte, rattachements
   en attente compris : fiche tuteur (`guardianId`, cible des pièces), état du lien, prénom, statut,
   publication et consentements actifs ; le nom et l'OZ ID dès le lien approuvé (lot 1.7bb). Liste
   vide sans enfant.

## Pourquoi l'acceptation n'ouvre aucun droit (révision du 2026-11-17)

Le plan prévoyait que l'acceptation pose `guardians.user_id` et accorde le rôle `guardian`. Or les
fonctions existantes s'appuient sur `guardians.user_id` sans toujours exiger un tuteur vérifié :
suppression du compte (la fiche tuteur de l'enfant serait anonymisée et close), export RGPD (le nom
et les contacts déclarés du vrai parent sortiraient pour quiconque a accepté le lien). Un rattachement
en attente, gardé sur l'invitation, ne touche à rien de cela. La vérification du lien (justificatif,
lot 1.7bb ; KYC, lot 1.10) posera le compte sur la fiche et accordera le rôle. Le lot 1.7bb le fait
après revue humaine du justificatif (ci-dessous).

## Une fiche tuteur par enfant (D2 révisée)

La décision d'origine était « une seule fiche tuteur par compte ». Le statut de vérification est
porté par la fiche tuteur : fusionner aurait donné à un tuteur déjà vérifié tous les droits de tuteur
vérifié sur un nouvel enfant, sans preuve de lien avec cet enfant. Chaque enfant garde sa fiche
tuteur ; un même compte peut en tenir plusieurs, chacune vérifiée séparément (EX-108 n° 2).

## Ce que l'acceptation ne fait pas (D3)

Elle ne vérifie rien et ne publie rien. La fiche de l'enfant reste non publiée tant qu'un tuteur
**vérifié** n'a pas donné son consentement (`oz_player_published`, EX-T16 n° 3, CP-13). Un mineur peut
désigner sa propre adresse et accepter avec un second compte majeur : l'invitation ne l'empêche pas.
La revue humaine du justificatif (lot 1.7bb) réduit ce risque sans le supprimer (pièce falsifiée) ;
la vérification d'identité du tuteur (KYC 2, lot 1.10) le ferme, et rien n'est publié avant elle.

## Justificatif de lien (lot 1.7bb, EX-108 n° 2)

1. **Pièces (R3).** Le compte du rattachement en attente dépose 1 à 3 pièces sur la fiche tuteur
   (`POST /documents/upload`, `guardianId`) : acte de naissance ou livret de famille
   (`birth_certificate`), jugement de tutelle (`guardianship_order`), obligatoire si le lien déclaré
   est « tuteur légal » ou « autre ». PDF, JPEG, PNG, WebP. C'est le seul droit de ce compte avant
   la revue : ni pièce d'identité, ni relecture de la pièce, ni rien sur la fiche de l'enfant. La
   base le juge (`oz_guardian_link_pending`, invitation acceptée par lui et non annulée).
2. **Dépôt.** `POST /guardians/link/submit` (`guardianId`, `documentIds`) : pièces du déposant,
   saines (analyse du lot 1.9 terminée), du bon type, jamais déjà utilisées. Fiche → `pending`. Un
   seul dépôt en revue à la fois ; 5 dépôts par jour et par compte.
3. **Revue (R2).** Un administrateur vérifié (`kyc.decide`) lit la file (`GET /admin/guardian-links`,
   noms déclarés, lien, date de naissance de l'enfant, pièces lues par URL signée de 5 minutes,
   auditée), puis décide (`POST /admin/guardian-links/:id/decision`), ré-authentifié par mot de passe
   et code. Un seul administrateur suffit ; jamais le déposant ni l'enfant.
4. **Approbation (R1).** Dans une transaction : `guardians.user_id` = le déposant, rôle `guardian`,
   fiche `in_review`. **Jamais `verified`** : réservé au KYC 2 du tuteur (lot 1.10). Les droits de la
   matrice sur l'enfant (lecture, modification, suppression, export) restent fermés : ils suivent le
   tuteur vérifié. Le tuteur voit le nom et l'OZ ID de l'enfant et peut consentir.
5. **Refus (R4).** Motif d'une liste fermée (`illegible`, `name_mismatch`, `child_mismatch`,
   `wrong_document`, `suspected_forgery`), fiche `rejected`, nouveau dépôt possible. Au 3e refus de
   la même invitation, ou sur faux suspecté, le rattachement est clos : l'enfant devra réinviter.
   Faux suspecté : alerte sécurité (`guardian.link.suspected_forgery`, identifiant du dépôt seul).
6. **Avis.** Email au déposant : prénom de l'enfant, décision, motif lisible ; jamais le nom.
7. **Conservation (R3).** Pièces gardées 6 mois après la décision (`retention_until`), puis purgées
   par le worker (lot 1.9cb).

Un rattachement qui tombe (nouvelle invitation, compte clos, enfant majeur ou détaché) retire le
dépôt en cours ; une fiche sans compte revient à `declared`.

## Consentement (lot 1.7bb, EX-108 n° 3 à 5, CP-13)

- **Textes (R6).** `consent_texts` garde chaque version, immuable, avec son empreinte SHA-256
  calculée par la base. Version 1 **provisoire** (`v1-provisoire`), rédigée par l'équipe technique,
  à faire valider par le porteur du projet puis par un juriste (Q7, dette D-135). Deux textes :
  traitement des données (`guardian_data_processing`) et publication de la fiche
  (`guardian_profile_publication`). Lecture : `GET /consent-texts/:type/current`.
- **Consentir.** `POST /guardians/me/children/:ozId/consents`, tuteur au lien approuvé, ré-authentifié.
  Version et empreinte du texte lu : un texte changé depuis est refusé (409). Heure de la base. La
  publication exige un consentement actif au traitement. Un second consentement identique rend le
  premier.
- **Avant le KYC (R5).** Le consentement est enregistré, mais la fiche reste non publiée tant que la
  fiche tuteur n'est pas `verified` (`oz_player_published`, CP-13).
- **Révoquer.** `DELETE /guardians/me/children/:ozId/consents/:type`, sans ré-authentification (le
  retrait doit rester simple). `revoked_at` à l'heure de la base, dans la transaction : la règle de
  lecture relit les consentements actifs, la fiche disparaît aussitôt pour les organisations.
  Retirer le traitement retire aussi la publication. Un consentement révoqué ne revit jamais.
- **Compte du tuteur clos.** Ses consentements sont révoqués (dépublication) et ses dépôts en cours
  retirés (déclencheur sur `users.deleted_at`).

## Inscription directe (D4)

Un tuteur peut créer son compte seul. Le rattachement à un enfant passe toujours par une invitation
émise depuis le compte de l'enfant.

## Journal et traces

- Audit : `guardian.invitation.created` (canal, sans contact ni jeton) et
  `guardian.invitation.accepted` (identifiant de l'invitation seulement) ; lot 1.7bb :
  `guardian.link.submitted`, `guardian.link.approved`, `guardian.link.rejected` (motif),
  `guardian.consent.granted` (type, version), `guardian.consent.revoked`.
- Journal applicatif : ni email, ni téléphone, ni jeton, ni prénom, ni identifiant d'enfant.
- Compte clos : ses rattachements en attente tombent (déclencheur sur `users.deleted_at`).
- Limites : 3 invitations par heure et par compte ; 10 aperçus ou acceptations par heure et par IP ;
  5 dépôts de justificatif par jour et par compte.
  Aucune limite par destinataire : l'adresse est celle saisie par l'enfant à l'inscription (D-134).
