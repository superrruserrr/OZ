# Tuteur légal

Référence : EX-108, lot 1.7b (sous-lots 1.7ba, 1.7bb, 1.7bc). Décisions D1 à D5 validées le
2026-11-16 ; D2 et le sens de l'acceptation révisés pour raison de sécurité et confirmés le
2026-11-17. Décisions R1 à R6 du lot 1.7bb validées le 2026-11-17. Décisions B1 à B6 du lot 1.7bc
et C6 (retrait du lien) validées le 2026-11-17.

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

Elle ne vérifie rien et ne publie rien. La fiche de l'enfant reste non publiée tant qu'un tuteur au
**lien validé** (justificatif approuvé) n'a pas donné son consentement (`oz_player_published`, EX-T16
n° 3, CP-13). Un mineur peut désigner sa propre adresse et accepter avec un second compte majeur :
l'invitation ne l'empêche pas. La revue humaine du justificatif (lot 1.7bb) réduit ce risque sans le
supprimer (pièce falsifiée) ; la vérification d'identité du tuteur (KYC 2, lot 1.10, après
l'ouverture) le fermera. Risque accepté pour l'ouverture (ADR-013, D-137, D-134) : la fiche publiée
n'est lue que par des organisations vérifiées, qui n'arrivent qu'avec les lots 1.8 et 1.10b.

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
   fiche `in_review`. **Jamais `verified`** : réservé au KYC 2 du tuteur (lot 1.10). Depuis le lot
   1.19a (E2, D-137), le lien validé ouvre les droits de la matrice sur l'enfant (lecture,
   visibilité, suppression, export ; `oz_guardian_link_approved`) et la publication après accord.
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
  validée pour la recette par le porteur du projet le 2026-11-17 (C1), à relire par un juriste avant
  la production (Q7, dette D-135). Deux textes :
  traitement des données (`guardian_data_processing`) et publication de la fiche
  (`guardian_profile_publication`). Lecture : `GET /consent-texts/:type/current`.
- **Consentir.** `POST /guardians/me/children/:ozId/consents`, tuteur au lien approuvé, ré-authentifié.
  Version et empreinte du texte lu : un texte changé depuis est refusé (409). Heure de la base. La
  publication exige un consentement actif au traitement. Un second consentement identique rend le
  premier.
- **Publication (D-137, lot 1.19a).** Lien validé, accord au traitement puis accord de publication :
  la fiche est publiée sans attendre le KYC 2 (`oz_player_published`, CP-13). Une fiche rejetée ou
  suspendue ne l'est jamais. Avant le lot 1.19a, elle restait non publiée jusqu'au KYC (R5).
- **Révoquer.** `DELETE /guardians/me/children/:ozId/consents/:type`, sans ré-authentification (le
  retrait doit rester simple). `revoked_at` à l'heure de la base, dans la transaction : la règle de
  lecture relit les consentements actifs, la fiche disparaît aussitôt pour les organisations.
  Retirer le traitement retire aussi la publication. Un consentement révoqué ne revit jamais.
- **Compte du tuteur clos.** Ses consentements sont révoqués (dépublication) et ses dépôts en cours
  retirés (déclencheur sur `users.deleted_at`).

## Retrait d'un lien approuvé par erreur (lot 1.7bc, décision C6)

`POST /admin/guardian-links/:id/revocation` (`:id` : le dépôt approuvé), administrateur vérifié
(`kyc.decide`), ré-authentifié par mot de passe et code. Motif d'une liste fermée (B3), jamais de
texte libre : `approved_in_error`, `suspected_fraud`, `child_request`, `other`. Jamais le tuteur ni
l'enfant concerné (403). Dans une transaction (`oz_guardian_link_revoke`) :

- le dépôt passe `revoked` (auteur, motif, heure de la base) ;
- `guardians.user_id` est vidé et la fiche revient à `declared` ;
- les consentements donnés pour cette fiche sont révoqués : la fiche est dépubliée aussitôt ;
- l'invitation est annulée : l'enfant peut réinviter ;
- le rôle `guardian` est retiré s'il ne sert plus à aucune autre fiche tuteur du compte ;
- les pièces restent 6 mois après le retrait (`retention_until`, R3).

Dépôt non approuvé ou déjà retiré : 409 `GUARDIAN_REVOCATION_CONFLICT`. Audit
`guardian.link.revoked` (dépôt, motif, nombre d'accords retirés ; aucun identifiant d'enfant). Email
au tuteur : prénom de l'enfant, sans motif (il peut viser le destinataire). Pas d'écran : la file de
revue et le retrait se font par l'API jusqu'au back-office (B6, D-135).

## Écrans (lot 1.7bc)

Le navigateur n'appelle jamais l'API (ADR-010) : actions serveur du site, CSP `connect-src 'self'`.

- **Joueur mineur** : `/onboarding/invitation-tuteur` (lien depuis l'écran « profil créé »). Canal
  email : seul le fait de l'envoi est affiché. Canal lien : le lien est montré une seule fois, avec
  un bouton copier ; rien ne le garde après la navigation.
- **Invitation** : `/tuteur/invitation#token=…`, ouverte sans compte. Le jeton est lu dans le
  fragment puis effacé de l'adresse ; le serveur du site le garde dans un cookie httpOnly
  `__Host-oz_guardian_invite` (SameSite=Strict, 30 minutes, B4) le temps de se connecter ou de créer
  son compte (`/auth/signup/guardian`, D4), puis l'efface à l'acceptation. La confirmation d'email
  ramène à l'invitation quand ce cookie est présent.
- **Espace** : `/tuteur`, enfants rattachés et étape suivante ; ni photo ni mise en avant. Un compte
  tuteur sans fiche joueur qui arrive sur `/onboarding` est renvoyé ici.
- **Justificatif** : `/tuteur/justificatif/:guardianId`. Chaque pièce passe par une action serveur
  du site (B1) : type réel lu dans les premiers octets (PDF, JPEG, PNG, WebP), 10 Mo au plus (B2),
  SHA-256, puis URL signée de l'API, envoi au stockage et réception. Le dépôt n'est accepté qu'une
  fois les pièces analysées saines.
- **Accords** : `/tuteur/accords/:ozId`. Texte présenté tel quel avec sa version ; accord
  ré-authentifié (mot de passe, code si la 2FA est active) avec la version et l'empreinte lues ;
  publication fermée tant que le traitement n'est pas consenti ; retrait confirmé, sans
  ré-authentification. Mention de l'audience : fiche lue par les seules organisations vérifiées.

## Inscription directe (D4)

Un tuteur peut créer son compte seul. Le rattachement à un enfant passe toujours par une invitation
émise depuis le compte de l'enfant.

## Journal et traces

- Audit : `guardian.invitation.created` (canal, sans contact ni jeton) et
  `guardian.invitation.accepted` (identifiant de l'invitation seulement) ; lot 1.7bb :
  `guardian.link.submitted`, `guardian.link.approved`, `guardian.link.rejected` (motif),
  `guardian.consent.granted` (type, version), `guardian.consent.revoked` ; lot 1.7bc :
  `guardian.link.revoked` (motif).
- Journal applicatif : ni email, ni téléphone, ni jeton, ni prénom, ni identifiant d'enfant.
- Compte clos : ses rattachements en attente tombent (déclencheur sur `users.deleted_at`).
- Limites : 3 invitations par heure et par compte ; 10 aperçus ou acceptations par heure et par IP ;
  5 dépôts de justificatif par jour et par compte.
  Aucune limite par destinataire : l'adresse est celle saisie par l'enfant à l'inscription (D-134).
