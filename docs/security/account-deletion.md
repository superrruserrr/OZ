# Suppression du compte

Droit à l'effacement (EX-118 n° 3, `design.md` §5.10). Lot 1.16ca : demande, rétractation,
annulation et anonymisation en base. Lot 1.16cba : exécution à l'échéance par le worker, fiche
masquée pendant le délai, gel d'un compte suspendu, accès malgré la 2FA obligatoire. Lot 1.16cbb :
demande d'un tuteur pour son enfant, E2E n° 9 et registre des traitements.

Décisions à confirmer par Fabrice [À CONFIRMER] :

- **D1** Délai de rétractation de 30 jours entre la demande et l'anonymisation, annulable.
- **D2** Toutes les sessions sont révoquées à la demande ; le titulaire peut se reconnecter pour
  suivre, annuler ou exporter ses données. Pendant le délai, sa fiche joueur est masquée aux tiers
  (lot 1.16cba, D7).
- **D3** Chaque colonne de la base est classée dans un registre d'effacement
  (`packages/db/src/erasure/registry.ts`) ; une colonne non classée fait échouer les tests.
- **D4** Le journal d'audit n'est jamais modifié (chaîne de hachage) : l'acteur et la cible restent
  l'identifiant du compte, devenu anonyme. Les motifs libres écrits par des tiers restent (D-118).
- **D5** Pièces et archives d'export sont rendues échues ; leurs fichiers sont supprimés par les
  purges existantes (lots 1.9cb et 1.16bb).
- **D6** Demande d'un tuteur pour son enfant mineur : lot 1.16cbb.

Lot 1.16cba [À CONFIRMER] :

- **D7** Pendant les 30 jours, la fiche joueur du titulaire est invisible des tiers, comme non
  publiée (lecture par OZ ID et recherche) ; le titulaire et l'administrateur la lisent encore.
  L'annulation la rend de nouveau visible.
- **D8** L'annulation reste possible jusqu'à l'exécution effective, échéance passée comprise.
- **D9** Compte suspendu à l'échéance : anonymisation différée (gel, art. 17(3) RGPD), rien n'est
  modifié, la demande reste en attente, audit `account.deletion.frozen` une fois par demande et
  alerte au journal du worker ; reprise au passage suivant la levée de la suspension.
- **D10** Dossier KYC encore ouvert (brouillon, soumis, en instruction) d'une fiche supprimée :
  passé `expired` sans décision, plus jamais décidable.

## Demande, suivi, annulation

Routes `authenticated` (`rbac.md`), le titulaire vient de la session :

| Route                      | Cas                                                        | Réponse                                         |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `POST /account/deletion`   | Mot de passe juste, plus le code TOTP ou de secours si 2FA | 202 `{ requestedAt, scheduledFor }`             |
|                            | Mot de passe faux, code manquant ou faux                   | 403 `ACCOUNT_DELETION_REJECTED`, indiscernables |
|                            | Suppression déjà programmée                                | 409 `ACCOUNT_DELETION_PENDING`                  |
|                            | Plus de 10 essais dans l'heure, ou délai du mot de passe   | 429 avec `Retry-After`                          |
| `GET /account/deletion`    | Suivi, `no-store`                                          | 200 `{ pending }`, `null` sans demande          |
| `DELETE /account/deletion` | Demande en attente, jusqu'à l'exécution (D8)               | 204                                             |
|                            | Aucune demande en attente                                  | 404 `ACCOUNT_DELETION_NOT_FOUND`                |

La demande est décidée par la base (`oz_account_deletion_request`) : une seule en attente par
compte, compte actif seulement, toutes les sessions révoquées (motif `account_deleted`), audit
`account.deletion.requested`. Le jeton d'accès en cours cesse de servir. Un email annonce la date
d'effet et la reconnexion pour annuler ; un second confirme l'annulation
(`oz_account_deletion_cancel`, audit `account.deletion.cancelled`). Ni mot de passe ni code ne sont
journalisés.

Les routes `/account/deletion` et `/account/data-export` sont ouvertes à une session restreinte
(rôle `admin`, `center` ou `federation` sans 2FA, `@TwoFactorEnrollment()`) : un droit RGPD ne
dépend pas de l'enrôlement. Toute autre route reste refusée à cette session.

Masquage (D7) : `oz_account_deletion_pending(user)` (`SECURITY DEFINER`, `oz_app` seul) conditionne
la politique `players_third_party_read` ; CASL lit l'attribut `deletionPending` au même instant que
la RLS et ses règles tierces exigent `deletionPending: false`. La grille d'équivalence RLS/CASL
couvre un majeur vérifié, un mineur publié et un mineur rattaché en suppression. Les politiques des pièces et
des dossiers KYC qui s'appuient sur `players` (lecture, dépôt) héritent du masquage, alors que CASL
accorde encore à l'organisation `document.read`, `document.upload` et `kyc.read` sur un rattaché en
délai : écart sans risque (la base refuse), suivi en D-120.

Le worker écarte une demande gelée dont l'alerte est déjà émise (`oz_account_deletion_due`) : un
compte suspendu ne retient pas le lot ; il revient à la levée de la suspension.

## Demande du tuteur (lot 1.16cbb)

Décisions [À CONFIRMER par Fabrice] :

- **D11** Un tuteur vérifié demande la suppression pour son enfant mineur : la fiche de l'enfant est
  anonymisée (OZ ID gardé) avec ses pièces et ses dossiers KYC et, si l'enfant a son propre compte,
  ce compte aussi. Mêmes 30 jours de rétractation, même masquage, même exécution.
- **D12** Seul le tuteur annule. L'enfant titulaire d'un compte est prévenu par email de la demande
  et de l'annulation ; il ne peut pas annuler.
- **D13** Tuteur vérifié seulement (fiche tuteur `verified`, non supprimée, compte actif), enfant
  mineur à la date de la demande ; ré-authentification du tuteur (mot de passe, plus code si 2FA).
- **D14** Enfant devenu majeur avant l'exécution : la tutelle cesse, le worker annule la demande
  (issue `majority`, audit `account.deletion.cancelled` motif `majority`), rien n'est modifié ; le
  majeur décide seul. Email de cette annulation : DEBT D-121.
- **D15** L'enfant qui a un compte garde son propre droit (`/account/deletion`) ; une seule demande
  en attente par fiche et par compte (409 `ACCOUNT_DELETION_PENDING`).

Action `profile.delete` (tuteur `child`, tous les autres rôles `deny`, `rbac.md`) :

| Route                            | Cas                                                   | Réponse                             |
| -------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| `POST /players/:ozId/deletion`   | Tuteur vérifié d'un mineur, ré-authentification juste | 202 `{ requestedAt, scheduledFor }` |
|                                  | Mot de passe ou code faux                             | 403 `ACCOUNT_DELETION_REJECTED`     |
|                                  | Hors droits, fiche inconnue, enfant majeur, refus     | 404 `NOT_FOUND`, indiscernables     |
|                                  | Demande déjà en attente sur la fiche ou son compte    | 409 `ACCOUNT_DELETION_PENDING`      |
|                                  | Plus de 10 essais dans l'heure                        | 429 avec `Retry-After`              |
| `GET /players/:ozId/deletion`    | Suivi, `no-store`                                     | 200 `{ pending }`                   |
| `DELETE /players/:ozId/deletion` | Demande du tuteur en attente                          | 204                                 |
|                                  | Aucune                                                | 404 `ACCOUNT_DELETION_NOT_FOUND`    |

La base décide (`oz_player_deletion_request`, `oz_player_deletion_status`,
`oz_player_deletion_cancel`, `SECURITY DEFINER`, `oz_app` seul) : verrou de la fiche, demande
`player_id` + `requested_by_user_id` (le tuteur), `user_id` = compte de l'enfant s'il existe, audit
`account.deletion.requested` sur la cible `player`. `oz_account_deletion_cancel` ignore les demandes
de fiche : le compte de l'enfant ne les annule pas. La fiche est masquée aux tiers dès la demande
(`oz_player_deletion_pending`). L'OZ ID est masqué dans les chemins journalisés (`:ozId`).

Comportements assumés : l'enfant titulaire d'un compte voit la demande du tuteur dans son
`GET /account/deletion`, mais son `DELETE` répond 404 ; ses sessions ne sont pas révoquées à la
demande (il garde l'accès jusqu'à l'exécution, révoquées alors). Le compte du tuteur n'est jamais
touché. Le compte de l'enfant est relu à l'exécution (rattaché pendant le délai compris). Un compte
d'enfant suspendu et gelé n'empêche pas l'annulation à la majorité. Un autre rôle que le tuteur
reçoit le 403 de la matrice (`@Can`) ; un tuteur sans droit sur la fiche, le 404 uniforme. Course
avec la demande propre de l'enfant : D-122.

## Anonymisation

`oz_account_anonymize(request)` n'est exécutable que par `oz_worker`, hors contexte utilisateur, et
seulement à l'échéance (`oz_account_deletion_due` liste les demandes échues). Rejouée, elle n'a pas
d'effet ; compte suspendu : `frozen`, rien modifié (D9). Dans une seule transaction :

- `users` : email remplacé par `deleted+<id>@invalid`, secrets, téléphone et dates de connexion
  effacés, statut `closed`, `deleted_at` posé ; rôles retirés ;
- sessions : IP, User-Agent et empreinte effacés, révoquées ; jetons et codes de secours consommés ;
- fiche joueur et fiche tuteur du compte : noms remplacés par `Anonyme`, date de naissance réduite
  au 1er janvier de son année, ville, téléphone et numéro de pièce effacés, `deleted_at` posé ; un
  enfant rattaché garde sa fiche, mais n'est plus publié faute de tuteur vérifié ;
- pièces : OCR et numéro effacés, rétention échue (purge du fichier par le lot 1.9cb) ;
- dossiers KYC : constats vidés et motif remplacé par `Motif effacé`, la décision restant figée
  (garde KYC étendue au seul chemin privilégié de l'anonymisation) ; dossier encore ouvert passé
  `expired` (D10) ;
- notifications : contenu et erreur d'envoi effacés ; archives d'export rendues échues, demandes en
  cours en échec `account_gone`, chacune auditée `data.export.failed` ;
- demande `done`, audit `account.deletion.done` (acteur `NULL` : le système).

L'OZ ID reste dans `players` et `oz_id_registry` : réservé à vie, jamais réattribué (CP-03).

## Exécution par le worker

File `account-deletion`, job planifié `anonymize-due` (BullMQ, identifiant fixe, un seul essai),
toutes les `ACCOUNT_DELETION_EVERY_MINUTES` (défaut 60, de 5 à 1 440) ; `ACCOUNT_DELETION_ENABLED`
toujours vrai en recette et en production. Chaque passage prend au plus 100 demandes échues et les
anonymise une à une, une transaction chacune ; un échec isolé est journalisé par son type, sans
arrêter les autres, et repris au passage suivant. Issues comptées (`done`, `frozen`, autres) ; seul
l'identifiant de la demande est journalisé. Les fichiers des pièces et des archives, rendus échus,
sont supprimés aux passages suivants des purges (lots 1.9cb et 1.16bb), prouvé de bout en bout sur
SeaweedFS (`apps/worker/test/data-export.int.test.ts`).

La preuve (`packages/db/test/account-deletion.int.test.ts`) remplit un compte complet de valeurs
marqueurs, l'anonymise, puis balaie le texte de toutes les tables, colonnes chiffrées déchiffrées
avec la clé : aucun marqueur ne subsiste ; agrégats, OZ ID, autres comptes et chaîne d'audit
intacts.

## Inventaire

Colonnes effacées et colonnes gardées, par table ; toutes les autres colonnes sont techniques
(clés, statuts, horodatages, empreintes non réversibles). Vérifié contre le registre par
`packages/db/src/erasure/inventory.test.ts`.

<!-- erasure:inventory -->

| Table                       | Effacées                                                                                                                                                                                                           | Gardées (agrégats)                                                                                                                                                | Gardées (preuve)                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | `email`, `password_hash`, `totp_secret_encrypted`, `totp_enabled_at`, `totp_pending_secret_encrypted`, `totp_last_step`, `email_verified_at`, `phone_verified_at`, `phone_encrypted`, `phone_hmac`, `last_seen_at` | —                                                                                                                                                                 | —                                                                                                                                                    |
| `user_roles`                | —                                                                                                                                                                                                                  | `role`, `organization_id`                                                                                                                                         | —                                                                                                                                                    |
| `sessions`                  | `user_agent`, `device_fingerprint`, `ip`                                                                                                                                                                           | —                                                                                                                                                                 | —                                                                                                                                                    |
| `players`                   | `first_name`, `last_name`, `birth_date`, `city`, `phone_encrypted`, `phone_hmac`, `document_number_encrypted`, `document_number_hmac`, `search_vector`                                                             | `nationality`, `country`, `region`, `primary_position`, `secondary_position`, `dominant_foot`, `height_cm`, `weight_kg`, `verification_status`, `organization_id` | `oz_id`                                                                                                                                              |
| `guardians`                 | `first_name`, `last_name`, `phone_encrypted`, `phone_hmac`, `email_encrypted`, `email_hmac`, `document_number_encrypted`, `document_number_hmac`                                                                   | `relationship`, `country`                                                                                                                                         | —                                                                                                                                                    |
| `consents`                  | —                                                                                                                                                                                                                  | —                                                                                                                                                                 | `type`, `text_version`, `player_id`, `granted_by_user_id`, `granted_by_guardian_id`, `granted_at`, `revoked_at`                                      |
| `audit_log`                 | —                                                                                                                                                                                                                  | —                                                                                                                                                                 | `id`, `created_at`, `chain_position`, `actor_user_id`, `action`, `target_type`, `target_id`, `reason`, `request_id`, `metadata`, `prev_hash`, `hash` |
| `documents`                 | `ocr_extract_encrypted`, `document_number_encrypted`, `document_number_hmac`                                                                                                                                       | `type`                                                                                                                                                            | —                                                                                                                                                    |
| `kyc_cases`                 | `checks`, `decision_reason`                                                                                                                                                                                        | `level`, `status`, `submitted_at`, `decided_at`                                                                                                                   | `decided_by`, `second_decided_by`                                                                                                                    |
| `notifications`             | `payload`, `last_error`                                                                                                                                                                                            | —                                                                                                                                                                 | —                                                                                                                                                    |
| `oz_id_registry`            | —                                                                                                                                                                                                                  | —                                                                                                                                                                 | `oz_id`, `player_id`, `issued_at`                                                                                                                    |
| `account_deletion_requests` | —                                                                                                                                                                                                                  | —                                                                                                                                                                 | `user_id`, `player_id`, `requested_by_user_id`, `status`, `requested_at`, `scheduled_for`, `cancelled_at`, `completed_at`                            |
| `saved_searches`            | `name`, `criteria`                                                                                                                                                                                                 | —                                                                                                                                                                 | —                                                                                                                                                    |
| `search_exports`            | —                                                                                                                                                                                                                  | `row_count`, `sort`, `criteria_keys`                                                                                                                              | `user_id`, `organization_id`                                                                                                                         |

<!-- /erasure:inventory -->

`players.birth_date` n'est pas effacée mais réduite à l'année ; `documents.perceptual_hash` reste,
comme `sha256` : empreinte non réversible figée par la garde des pièces.
