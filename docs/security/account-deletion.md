# Suppression du compte

Droit à l'effacement (EX-118 n° 3, `design.md` §5.10). Lot 1.16ca : demande, rétractation,
annulation et anonymisation en base. Lot 1.16cb : exécution à l'échéance par le worker, purge des
fichiers, demande d'un tuteur pour son enfant, E2E n° 9 et registre des traitements.

Décisions à confirmer par Fabrice [À CONFIRMER] :

- **D1** Délai de rétractation de 30 jours entre la demande et l'anonymisation, annulable.
- **D2** Toutes les sessions sont révoquées à la demande ; le titulaire peut se reconnecter pour
  suivre, annuler ou exporter ses données. Le masquage de la fiche joueur aux tiers pendant le délai
  est reporté au lot 1.16cb (DEBT D-117) : jusque-là, la fiche reste visible 30 jours.
- **D3** Chaque colonne de la base est classée dans un registre d'effacement
  (`packages/db/src/erasure/registry.ts`) ; une colonne non classée fait échouer les tests.
- **D4** Le journal d'audit n'est jamais modifié (chaîne de hachage) : l'acteur et la cible restent
  l'identifiant du compte, devenu anonyme. Les motifs libres écrits par des tiers restent (D-118).
- **D5** Pièces et archives d'export sont rendues échues ; leurs fichiers sont supprimés par les
  purges existantes (lots 1.9cb et 1.16bb).
- **D6** Demande d'un tuteur pour son enfant mineur : lot 1.16cb.

## Demande, suivi, annulation

Routes `authenticated` (`rbac.md`), le titulaire vient de la session :

| Route                      | Cas                                                        | Réponse                                         |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `POST /account/deletion`   | Mot de passe juste, plus le code TOTP ou de secours si 2FA | 202 `{ requestedAt, scheduledFor }`             |
|                            | Mot de passe faux, code manquant ou faux                   | 403 `ACCOUNT_DELETION_REJECTED`, indiscernables |
|                            | Suppression déjà programmée                                | 409 `ACCOUNT_DELETION_PENDING`                  |
|                            | Plus de 10 essais dans l'heure, ou délai du mot de passe   | 429 avec `Retry-After`                          |
| `GET /account/deletion`    | Suivi, `no-store`                                          | 200 `{ pending }`, `null` sans demande          |
| `DELETE /account/deletion` | Demande en attente, échéance non atteinte                  | 204                                             |
|                            | Aucune demande en attente                                  | 404 `ACCOUNT_DELETION_NOT_FOUND`                |

La demande est décidée par la base (`oz_account_deletion_request`) : une seule en attente par
compte, compte actif seulement, toutes les sessions révoquées (motif `account_deleted`), audit
`account.deletion.requested`. Le jeton d'accès en cours cesse de servir. Un email annonce la date
d'effet et la reconnexion pour annuler ; un second confirme l'annulation
(`oz_account_deletion_cancel`, audit `account.deletion.cancelled`). Ni mot de passe ni code ne sont
journalisés.

## Anonymisation

`oz_account_anonymize(request)` n'est exécutable que par `oz_worker`, hors contexte utilisateur, et
seulement à l'échéance (`oz_account_deletion_due` liste les demandes échues). Rejouée, elle n'a pas
d'effet. Dans une seule transaction :

- `users` : email remplacé par `deleted+<id>@invalid`, secrets, téléphone et dates de connexion
  effacés, statut `closed`, `deleted_at` posé ; rôles retirés ;
- sessions : IP, User-Agent et empreinte effacés, révoquées ; jetons et codes de secours consommés ;
- fiche joueur et fiche tuteur du compte : noms remplacés par `Anonyme`, date de naissance réduite
  au 1er janvier de son année, ville, téléphone et numéro de pièce effacés, `deleted_at` posé ; un
  enfant rattaché garde sa fiche, mais n'est plus publié faute de tuteur vérifié ;
- pièces : OCR et numéro effacés, rétention échue (purge du fichier par le lot 1.9cb) ;
- dossiers KYC : constats vidés et motif remplacé par `Motif effacé`, la décision restant figée
  (garde KYC étendue au seul chemin privilégié de l'anonymisation) ;
- notifications : contenu et erreur d'envoi effacés ; archives d'export rendues échues, demandes en
  cours en échec `account_gone` ;
- demande `done`, audit `account.deletion.done` (acteur `NULL` : le système).

L'OZ ID reste dans `players` et `oz_id_registry` : réservé à vie, jamais réattribué (CP-03).

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
| `account_deletion_requests` | —                                                                                                                                                                                                                  | —                                                                                                                                                                 | `user_id`, `status`, `requested_at`, `scheduled_for`, `cancelled_at`, `completed_at`                                                                 |

<!-- /erasure:inventory -->

`players.birth_date` n'est pas effacée mais réduite à l'année ; `documents.perceptual_hash` reste,
comme `sha256` : empreinte non réversible figée par la garde des pièces.
