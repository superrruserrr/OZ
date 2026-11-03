# Export des données personnelles

Droit d'accès et de portabilité (EX-118 n° 2, `design.md` §5.10). Lot 1.16ba : inventaire,
assemblage en base, demande et suivi. Lot 1.16bb : archive produite par le worker, préfixe privé
`exports/`, URL signée, email « archive prête », expiration.

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

## Cycle de vie de l'archive (lot 1.16bb)

1. **Demande** acceptée (`pending`) : l'API la met en file `data-export` (job `build-export`,
   identifiant de la demande seul, 3 essais). File indisponible : la réponse reste 202, la demande
   reste `pending` et le balayage la reprend.
2. **Production** par le worker (`oz_worker`, une archive à la fois) : `oz_data_export_claim`
   (`processing`), `oz_personal_data_export` (clé `DATABASE_ENCRYPTION_KEY`), écriture sous
   `exports/<demande>.json` du bucket privé des documents (`application/json`, `no-store`,
   SHA-256 vérifiée par le stockage), puis `oz_data_export_finish` (`ready`, disponible 7 jours,
   audit `data.export.ready`). Rejoué après succès : sans effet. Compte supprimé entre-temps :
   `failed` motif `account_gone`, aucun objet. Erreur au troisième essai : `failed` motif
   `build_failed`, objet retiré. Motifs internes seulement (`^[a-z_]{1,40}$`), audités
   `data.export.failed` ; une demande en échec ne bloque pas la suivante. Compte supprimé, suspendu
   ou clos à la prise ou à la fin : `failed` motif `account_gone`, rien de servi. `finish` et `fail`
   rendent le statut atteint : une archive n'est jamais retirée d'une demande `ready` (exécution en
   double, course avec la maintenance) ; un retrait en échec est journalisé.
3. **Email** « archive prête » envoyé une fois par le worker après la fin : ni URL signée ni donnée,
   seulement l'invitation à se connecter (adresse lue dans l'export). Échec SMTP journalisé par son
   type seul, sans rejouer l'archive. Au plus une fois : une panne entre la fin et l'envoi le perd
   (D-115). Sans SMTP (local) : aucun email.
4. **Téléchargement** : `GET /account/data-export/download` rend `{ url, expiresAt }`, URL signée de
   5 minutes (type `application/json`, `attachment` et `no-store` signés), `Cache-Control: no-store`.
   `oz_data_export_download` (sous le contexte du titulaire, compte actif ou en attente de
   vérification) ne rend que la clé de **sa** dernière archive prête et non échue, et audite
   `data.export.downloaded` avant la signature. Sans archive : 404 `DATA_EXPORT_NOT_FOUND`. 30
   délivrances par heure et par compte, puis 429. Ni l'URL ni la clé ne sont journalisées. Une URL
   signée juste avant l'échéance reste valable 5 minutes au plus au-delà des 7 jours, et l'objet
   est supprimé au passage de maintenance suivant (D-116).
5. **Expiration et balayage** (`maintain-exports`, toutes les `DATA_EXPORT_EVERY_MINUTES`) :
   `oz_data_export_due` désigne les archives échues (objet supprimé **puis** `expired`, clé
   effacée, audit `data.export.expired`), les demandes sans nouvelle depuis 30 minutes (remises en
   file ou rejouées) et celles de plus de 24 heures (`failed` motif `abandoned`, objet retiré).

Toutes ces fonctions sont `SECURITY DEFINER`, réservées à `oz_worker` hors contexte utilisateur ;
`oz_app` n'exécute que `oz_data_export_download`. La clé d'une archive est contrainte en base à
`exports/<demande>.json` et `@oz/storage` refuse toute autre clé avant tout appel réseau ;
`put` et `copy` n'écrivent jamais sous `exports/`. Le worker ne consomme la file que si
`DATABASE_ENCRYPTION_KEY` est fournie (exigée en recette et en production, avec SMTP authentifié).

Le motif libre d'une entrée du journal écrite par un tiers est exporté tel quel (D-112).
