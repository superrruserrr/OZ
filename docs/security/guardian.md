# Tuteur légal

Référence : EX-108, lot 1.7b (sous-lots 1.7ba, 1.7bb, 1.7bc). Décisions D1 à D5 validées le
2026-11-16 ; D2 et le sens de l'acceptation révisés à l'exécution pour raison de sécurité (voir
plus bas), à confirmer.

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
   en attente compris : prénom, statut et publication ; le nom et l'OZ ID seulement pour un tuteur
   vérifié. Liste vide sans enfant.

## Pourquoi l'acceptation n'ouvre aucun droit (révision du 2026-11-17)

Le plan prévoyait que l'acceptation pose `guardians.user_id` et accorde le rôle `guardian`. Or les
fonctions existantes s'appuient sur `guardians.user_id` sans toujours exiger un tuteur vérifié :
suppression du compte (la fiche tuteur de l'enfant serait anonymisée et close), export RGPD (le nom
et les contacts déclarés du vrai parent sortiraient pour quiconque a accepté le lien). Un rattachement
en attente, gardé sur l'invitation, ne touche à rien de cela. La vérification du lien (justificatif,
lot 1.7bb ; KYC, lot 1.10) posera le compte sur la fiche et accordera le rôle.

## Une fiche tuteur par enfant (D2 révisée)

La décision d'origine était « une seule fiche tuteur par compte ». Le statut de vérification est
porté par la fiche tuteur : fusionner aurait donné à un tuteur déjà vérifié tous les droits de tuteur
vérifié sur un nouvel enfant, sans preuve de lien avec cet enfant. Chaque enfant garde sa fiche
tuteur ; un même compte peut en tenir plusieurs, chacune vérifiée séparément (EX-108 n° 2).

## Ce que l'acceptation ne fait pas (D3)

Elle ne vérifie rien et ne publie rien. La fiche de l'enfant reste non publiée tant qu'un tuteur
**vérifié** n'a pas donné son consentement (`oz_player_published`, EX-T16 n° 3, CP-13). Un mineur peut
désigner sa propre adresse et accepter avec un second compte majeur : l'invitation ne l'empêche pas,
le justificatif de lien (lot 1.7bb) et la vérification d'identité (lot 1.10) le bloquent.

## Inscription directe (D4)

Un tuteur peut créer son compte seul. Le rattachement à un enfant passe toujours par une invitation
émise depuis le compte de l'enfant.

## Journal et traces

- Audit : `guardian.invitation.created` (canal, sans contact ni jeton) et
  `guardian.invitation.accepted` (identifiant de l'invitation seulement).
- Journal applicatif : ni email, ni téléphone, ni jeton, ni prénom, ni identifiant d'enfant.
- Compte clos : ses rattachements en attente tombent (déclencheur sur `users.deleted_at`).
- Limites : 3 invitations par heure et par compte ; 10 aperçus ou acceptations par heure et par IP.
  Aucune limite par destinataire : l'adresse est celle saisie par l'enfant à l'inscription (D-134).
