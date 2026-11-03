# Export des données personnelles

Droit d'accès et de portabilité (EX-118 n° 2, `design.md` §5.10). Lot 1.16ba : inventaire,
assemblage en base, demande et suivi. Lot 1.16bb : archive produite par le worker, bucket `exports`,
URL signée, email « archive prête », expiration (D-111).

## Qui exporte quoi

- Toute personne titulaire d'un compte exporte **ses propres données**, qu'elle tienne un rôle ou
  non : les routes sont `authenticated`, le titulaire vient de la session (`rbac.md`).
- Un tuteur reçoit aussi les données de chacun de ses **enfants mineurs dont il est le tuteur
  vérifié** (D4) ; un enfant devenu majeur, ou rattaché à un lien de tutelle non vérifié, n'y figure
  pas. Un mineur titulaire d'un compte exporte ses propres données.
- Personne d'autre n'apparaît : un acteur tiers du journal est rendu par ses rôles (`admin`,
  `federation`…) ou `system`, jamais par son identité, et ses métadonnées ne sortent pas (D5) ;
  l'auteur d'un consentement est rendu `self`, `guardian` ou `other`. Une entrée écrite par la personne sur la fiche ou la pièce d'autrui (fiche consultée,
  enfant devenu majeur) garde son action et son type de cible, sans identifiant de cible ni
  métadonnées ; un consentement ne sort que s'il vise un joueur de l'export ou aucun joueur.

## Demande

`POST /account/data-export` (corps `{ password, code? }`) :

| Cas                                                        | Réponse                                    |
| ---------------------------------------------------------- | ------------------------------------------ |
| Mot de passe juste, plus le code TOTP ou de secours si 2FA | 202, statut `pending`                      |
| Mot de passe faux, code manquant ou faux                   | 403 `DATA_EXPORT_REJECTED`, indiscernables |
| Demande en attente, en cours ou prête                      | 409 `DATA_EXPORT_ACTIVE`                   |
| Demande acceptée il y a moins de 24 heures (hors échec)    | 409 `DATA_EXPORT_TOO_SOON`, `Retry-After`  |
| Plus de 10 essais dans l'heure, ou délai du mot de passe   | 429 avec `Retry-After`                     |
| Corps invalide ou champ inconnu                            | 422                                        |

Le mot de passe passe par le délai exponentiel partagé avec la connexion, puis, si la 2FA est
active, le code : il n'est consommé qu'après un mot de passe juste (un pas TOTP ne sert qu'une fois ;
un code de secours est perdu une fois utilisé). Oracle résiduel sur le mot de passe : D-114. Ni l'un ni l'autre n'est journalisé. La base décide en dernier
(`oz_data_export_request`, `SECURITY DEFINER`) : compte non supprimé, ni suspendu ni clos, verrou du
compte contre deux demandes simultanées, une seule demande active (index unique partiel), une par
24 heures (une demande en échec ne compte pas) ; chaque demande acceptée est auditée `data.export.requested` dans la même transaction.
Un email d'alerte part au titulaire après la réponse.

`GET /account/data-export` rend la dernière demande (`status`, `requestedAt`, `readyAt`,
`expiresAt`, `nextRequestAt`) sous `latest`, ou `latest: null` s'il n'y en a aucune, avec
`Cache-Control: no-store`. La table
`data_export_requests` est sous RLS forcée : lecture de ses seules demandes, aucune écriture directe.

## Assemblage

`oz_personal_data_export(user, clé)` rend un JSON UTF-8 versionné (`formatVersion: 1`, D7), une
section par catégorie. Elle n'est exécutable que par `oz_worker` : l'API (`oz_app`) ne peut pas
l'appeler. Les valeurs chiffrées (téléphones, emails et numéros de pièce des fiches) sont
déchiffrées avec `DATABASE_ENCRYPTION_KEY`.

Chaque colonne de la base est classée dans `packages/db/src/export/registry.ts` : exportée sous
`section.champ`, ou exclue avec son motif. Une colonne non classée fait échouer les tests, et le JSON
rendu doit porter exactement les champs du registre (`packages/db/test/data-export.int.test.ts`).
L'inventaire ci-dessous est comparé au registre par `packages/db/src/export/inventory.test.ts`.

<!-- export:inventory -->

| Section         | Champs                                                                                                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account`       | `createdAt`, `email`, `emailVerifiedAt`, `id`, `lastSeenAt`, `phone`, `phoneVerifiedAt`, `status`, `twoFactorEnabledAt`, `updatedAt`                                                                                                                                                                  |
| `roles`         | `grantedAt`, `organizationId`, `organizationName`, `revokedAt`, `role`                                                                                                                                                                                                                                |
| `sessions`      | `createdAt`, `expiresAt`, `id`, `ip`, `lastUsedAt`, `revokedAt`, `revokedReason`, `userAgent`                                                                                                                                                                                                         |
| `players`       | `birthDate`, `city`, `country`, `createdAt`, `documentNumber`, `dominantFoot`, `firstName`, `heightCm`, `id`, `lastName`, `nationality`, `organizationId`, `ozId`, `phone`, `primaryPosition`, `region`, `relation`, `secondaryPosition`, `updatedAt`, `verificationStatus`, `visibility`, `weightKg` |
| `guardians`     | `country`, `createdAt`, `documentNumber`, `email`, `firstName`, `id`, `lastName`, `phone`, `relationship`, `updatedAt`, `verificationStatus`                                                                                                                                                          |
| `consents`      | `grantedAt`, `grantedBy`, `id`, `playerId`, `revokedAt`, `textVersion`, `type`                                                                                                                                                                                                                        |
| `documents`     | `checkedAt`, `guardianId`, `id`, `mimeType`, `playerId`, `purgedAt`, `rejectionReason`, `retentionUntil`, `sizeBytes`, `status`, `type`, `uploadedAt`                                                                                                                                                 |
| `kycCases`      | `decidedAt`, `decisionReason`, `id`, `level`, `playerId`, `status`, `submittedAt`                                                                                                                                                                                                                     |
| `notifications` | `channel`, `payload`, `readAt`, `scheduledAt`, `sentAt`, `status`, `template`                                                                                                                                                                                                                         |
| `auditLog`      | `action`, `actor`, `at`, `metadata`, `reason`, `targetId`, `targetType`                                                                                                                                                                                                                               |

<!-- /export:inventory -->

L'IP d'une session est déjà tronquée à l'enregistrement (/24 en IPv4, /48 en IPv6). Les lignes
supprimées (`deleted_at`) ne sont pas exportées ; un rôle retiré l'est, avec sa date (`revokedAt`).

## Exclusions

- **Pièces (D1, à confirmer par Fabrice)** : métadonnées seules (type, taille, statut, dates, motif
  de rejet). Ni fichier, ni clé de stockage, ni empreinte, ni contenu extrait par OCR, ni numéro lu
  sur la pièce, ni contrôles internes d'un dossier KYC. Les fichiers restent lisibles par
  `GET /documents/:id/url` tant qu'ils ne sont pas purgés.
- **Secrets (D6)** : empreinte du mot de passe, secrets TOTP (actif et en attente), dernier pas TOTP,
  empreintes des jetons de session, de vérification et des codes de secours, empreinte d'appareil,
  index aveugles, clés de stockage, SHA-256 et empreinte perceptuelle des pièces.
- **Données d'autrui** : identité des décideurs KYC et des auteurs internes (`created_by`,
  `uploaded_by`…), métadonnées d'une entrée du journal écrite par un tiers, lien vers la pièce d'un
  autre (`document_duplicates`), données des organisations hors du nom de celle où un rôle est tenu.
- **Technique** : identifiants de famille de session, tentatives et erreurs d'envoi des
  notifications, chaîne du journal (positions, empreintes), intentions de dépôt, imports,
  abonnements, réglages.

Les motifs de chaque colonne exclue sont dans le registre.

## Reste à faire (lot 1.16bb)

Production de l'archive par le worker (file BullMQ), bucket privé `exports`, URL signée de courte
durée, email « archive prête », expiration et suppression de l'archive (D-111). Le motif libre d'une
entrée du journal écrite par un tiers est exporté tel quel (D-112).
