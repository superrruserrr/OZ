# Matrice des droits (RBAC)

Référence EX-104 n° 8, lots 1.4a et 1.4b. Ce document **fait foi** : `packages/auth/src/authorization/matrix.test.ts` et `apps/api/test/rbac-matrix.int.test.ts` lisent ces tableaux. Une route absente, une cellule vide ou inconnue fait échouer la CI. La matrice est dérivée de l'Annexe B du document de projet ; les cellules d'abord marquées [À CONFIRMER] ont été tranchées par Gaëtan Wassu le 2026-11-02 (décisions D1 à D7 du lot 1.4a).

## Trois couches

| Couche        | Rôle                                                      | Lot  |
| ------------- | --------------------------------------------------------- | ---- |
| CASL          | Décision applicative, avec les rôles relus en base        | 1.4a |
| RLS           | Filet en base, indépendant du code applicatif             | 1.4b |
| Sérialisation | Seuls les champs de la vue du rôle quittent l'API (CP-10) | 1.4b |

## Vocabulaire des cellules

| Valeur        | Sens                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------- |
| `deny`        | Refusé                                                                                    |
| `never`       | Refusé à tout palier et tout niveau KYC, sans exception possible                          |
| `tier`        | Dépend du palier : refusé en Phase 1, seul le palier gratuit existe (EX-210)              |
| `allow`       | Permis                                                                                    |
| `self`        | Sur son propre profil                                                                     |
| `self-adult`  | Sur son propre profil, s'il est majeur                                                    |
| `self+child`  | Sur son propre profil et sur un joueur mineur dont le compte est le tuteur vérifié        |
| `child`       | Sur un joueur dont le compte est le tuteur                                                |
| `org`         | Dans une organisation dont le compte est membre (joueurs rattachés ou organisation visée) |
| `tested`      | Sur un joueur testé par le centre du compte                                               |
| `limited`     | Permis à portée réduite : profils vérifiés, sans export ni critères avancés               |
| `org+limited` | Rattachés sans limite, autres profils vérifiés à portée réduite                           |
| `logged`      | Permis, et chaque accès est journalisé                                                    |
| `kyc3`        | Permis au niveau KYC 3 seulement                                                          |
| `kyc3+org`    | Comme `org`, au niveau KYC 3 seulement                                                    |
| `kyc3+logged` | Permis au niveau KYC 3 seulement, journalisé et visible du tuteur (EX-T16 n° 5)           |

Le niveau KYC n'existe qu'au lot 1.10 : d'ici là, toute valeur `kyc3` est refusée, donc recruteurs et agences n'ont aucun droit (plan §7.3), sauf déposer le justificatif de leur propre organisation (`document.upload`, D5 du lot 1.9a).

## Actions par rôle

La colonne `recruiter` vaut aussi pour l'agence. `player.read_public` ne porte que sur un profil majeur vérifié ; les actions sur un mineur, sur un profil mineur seulement. Un rôle ne compte que si son organisation est vérifiée (plan §7.3). Pour `player.read_minor`, `allow`, `limited`, `tested` et `kyc3+logged` ne valent que sur un mineur vérifié dont le tuteur vérifié a consenti à la publication (EX-T16 n° 3) ; tuteur, joueur, organisation de rattachement et administrateur ne sont pas soumis à cette condition.

<!-- rbac:actions -->

| Action                      | Libellé                                       | player     | guardian   | academy     | club  | federation | center | recruiter   | admin  |
| --------------------------- | --------------------------------------------- | ---------- | ---------- | ----------- | ----- | ---------- | ------ | ----------- | ------ |
| `profile.read`              | Voir le profil complet                        | self       | child      | deny        | deny  | deny       | deny   | deny        | logged |
| `profile.update`            | Modifier un profil (hors KYC, rôle, statut)   | self-adult | child      | org         | org   | deny       | deny   | deny        | logged |
| `profile.set_visibility`    | Régler les blocs visibles des tiers           | self-adult | child      | deny        | deny  | deny       | deny   | deny        | deny   |
| `player.create`             | Créer ou importer des joueurs                 | deny       | deny       | org         | org   | deny       | deny   | deny        | allow  |
| `player.read_public`        | Voir un profil majeur vérifié                 | allow      | allow      | allow       | allow | allow      | allow  | kyc3        | allow  |
| `player.search`             | Rechercher des joueurs                        | deny       | deny       | limited     | allow | allow      | deny   | kyc3        | allow  |
| `player.read_club_contact`  | Voir les coordonnées du club ou de l'académie | deny       | deny       | tier        | tier  | allow      | deny   | tier        | allow  |
| `player.read_minor`         | Voir un profil mineur                         | self       | child      | org+limited | allow | allow      | tested | kyc3+logged | logged |
| `player.read_minor_contact` | Voir les coordonnées directes d'un mineur     | deny       | child      | deny        | deny  | deny       | deny   | never       | logged |
| `list.manage`               | Créer des listes et shortlists                | deny       | deny       | allow       | allow | allow      | deny   | kyc3        | deny   |
| `test.certify`              | Saisir et certifier des tests (Phase 2)       | deny       | deny       | deny        | deny  | deny       | allow  | deny        | deny   |
| `test.review`               | Revoir des tests certifiés                    | deny       | deny       | deny        | deny  | deny       | deny   | deny        | allow  |
| `kyc.decide`                | Décider un dossier KYC, valider un compte     | deny       | deny       | deny        | deny  | deny       | deny   | deny        | allow  |
| `kyc.read`                  | Consulter un dossier KYC (appui licences)     | deny       | deny       | deny        | deny  | allow      | deny   | deny        | allow  |
| `audit.read`                | Consulter le journal d'accès d'un profil      | self       | child      | deny        | deny  | deny       | deny   | deny        | allow  |
| `audit.read_log`            | Consulter le journal d'audit entier           | deny       | deny       | deny        | deny  | deny       | deny   | deny        | allow  |
| `subscription.manage`       | Gérer un abonnement                           | deny       | deny       | org         | org   | org        | org    | kyc3+org    | allow  |
| `document.upload`           | Déposer une pièce ou un justificatif          | self       | self+child | org         | org   | org        | org    | org         | deny   |
| `document.read`             | Obtenir l'URL de lecture d'une pièce saine    | self       | self+child | org         | org   | org        | org    | org         | logged |

Aucune action ne permet de modifier son rôle, son niveau KYC ou son statut (CP-07) : `profile.update` se décide sur une liste blanche de champs, la même pour tous, administrateur compris. La tutelle s'arrête à la majorité de l'enfant. La revue quatre yeux d'un dossier KYC et la portée exacte de `kyc.read` sont précisées au lot 1.10.

`document.upload` (lot 1.9a) : `self` vise les pièces de sa propre personne (fiche joueur ou fiche tuteur), `child` celles de l'enfant mineur dont le compte est le tuteur vérifié, `org` le justificatif de sa propre organisation, plus, pour l'académie et le club, les pièces de leurs joueurs rattachés. Seules les pièces d'identité, actes de naissance, photos et licences visent une personne ; le seul justificatif d'organisation est `organization_registration` ; la vidéo attend son lot (D4). Comme ailleurs, un rôle ne compte qu'une fois son organisation vérifiée : l'organisation en attente ne dépose pas encore son justificatif (D-091).

`document.read` (lot 1.9ca, décision du 2026-11-02) : mêmes portées que `document.upload`, sur les pièces déjà déclarées saines ; l'administrateur lit toute pièce (revue KYC). Toute lecture délivrée, quel que soit le rôle, est inscrite au journal d'audit (`document.read.granted`).

`audit.read_log` (lot 1.16a) : le journal d'audit entier (`GET /admin/audit-log`) et l'état de sa dernière vérification ; distinct d'`audit.read`, le journal des consultations d'un profil, ouvert à son titulaire et à son tuteur. Seul l'administrateur vérifié le consulte ; la base le confirme par la politique `audit_log_admin_read`.

Export des données personnelles (lot 1.16ba, EX-118 n° 2) : toute personne exporte ses propres données, qu'elle tienne un rôle ou non ; les routes `/account/data-export` sont donc `authenticated` et non une action de la matrice, le titulaire venant de la session. La demande exige le mot de passe, plus le code TOTP ou de secours si la 2FA est active ; la base l'enregistre par `oz_data_export_request` (une à la fois, une par 24 heures) et l'audite (`data.export.requested`). L'assemblage (`oz_personal_data_export`) n'est exécutable que par `oz_worker`. Lot 1.16bb : l'archive prête est servie par `GET /account/data-export/download` (URL signée de 5 minutes de sa seule archive, auditée `data.export.downloaded` par `oz_data_export_download`). Détail : `docs/security/data-export.md`.

Suppression du compte (lot 1.16ca, EX-118 n° 3) : toute personne supprime son propre compte ; les routes `/account/deletion` sont `authenticated`, le titulaire venant de la session. La demande exige la même ré-authentification que l'export ; la base l'enregistre par `oz_account_deletion_request` (une en attente au plus), révoque toutes les sessions et l'audite (`account.deletion.requested`). Le titulaire peut se reconnecter pendant 30 jours pour suivre ou annuler (`oz_account_deletion_cancel`, `account.deletion.cancelled`). L'anonymisation (`oz_account_anonymize`) n'est exécutable que par `oz_worker`. Détail : `docs/security/account-deletion.md`.

## RLS de lecture des joueurs (lot 1.4b)

Pour un tiers, la base ne rend une ligne de `players` que si CASL en permet la lecture (`profile.read`, `player.read_public` ou `player.read_minor`) au même instant ; seule `players_owner` (titulaire et tuteur déclaré) reste plus large, jusqu'au lot 1.7 (D-089). `playerRecord` rend l'instant de la base (`checkedAt`), à passer à `playerSubject`. L'équivalence est prouvée sur une grille acteurs × joueurs par `packages/db/test/rbac-rls.int.test.ts`, y compris sous un propriétaire de fonctions soumis à la RLS (recette, production).

| Politique                  | Qui                                                               | Quelles lignes                                                                 |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `players_owner` (lot 1.1a) | Titulaire et tuteur déclaré                                       | Leur profil, leurs enfants ; plus large que CASL, pour l'inscription (lot 1.7) |
| `players_third_party_read` | Joueur, tuteur, académie, club, fédération, centre                | Majeurs vérifiés, non supprimés                                                |
|                            | Académie, club, fédération                                        | Mineurs vérifiés et publiés avec consentement actif d'un tuteur vérifié        |
|                            | Académie, club                                                    | Mineurs rattachés à leur organisation                                          |
| `players_admin_read`       | Administrateur                                                    | Toutes, en lecture seule ; journalisation au lot 1.16                          |
| aucune                     | Recruteur, agence, compte sans rôle ou hors organisation vérifiée | Aucune ligne, tant que le KYC 3 n'existe pas (lot 1.10)                        |

Le centre ne lit aucun mineur tant qu'aucun résultat de test n'est enregistré. La minorité est recalculée par `oz_is_minor` sur le calendrier UTC, avec la même règle que `isMinor`. Les fonctions d'appui (`oz_is_minor_at`, `oz_is_minor`, `oz_has_verified_role`, `oz_is_verified_member`, `oz_player_published`) ne rendent qu'un booléen ; leur exécution est retirée à `PUBLIC` et accordée à `oz_app` seul (D-066). Un rôle qui lit `players` sans ce droit reçoit une erreur, jamais une ligne. Les appels sans colonne sont évalués une fois par requête.

## Vues (lot 1.4b)

Un champ non autorisé n'est pas envoyé (EX-104 n° 3). Les vues sont des listes blanches figées dans `packages/auth/src/authorization/views.ts` ; aucune colonne chiffrée ni empreinte n'y figure, le téléphone sort déchiffré sous `phone`.

| Vue                      | Pour                                                | Champs                                                            |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| `PlayerSelfView`         | Titulaire                                           | Identité, date de naissance, sport, statut, rattachement, `phone` |
| `PlayerGuardianView`     | Tuteur vérifié d'un enfant mineur                   | Mêmes champs                                                      |
| `PlayerAdminView`        | Administrateur                                      | Mêmes champs                                                      |
| `PlayerOrganizationView` | Académie ou club de rattachement, sur un mineur     | Mêmes champs, sans `phone`                                        |
| `PlayerPublicView`       | Tout autre lecteur permis (recruteur KYC 3 compris) | Identité, année de naissance (`birthYear`), sport                 |

Toutes les vues portent le badge `verificationLevel` (lot 1.13a) : 0 email seul, 1 email et téléphone du compte titulaire vérifiés, 2 identité vérifiée ; un joueur sans compte reste à 0 avant vérification (D-109) ; jamais les dates de vérification. Le titulaire majeur, ou le tuteur vérifié d'un mineur (`profile.set_visibility`), peut masquer aux tiers trois blocs : `location` (région, ville), `physical` (taille, poids), `sport` (postes, pied fort). Un bloc masqué disparaît de `PlayerPublicView` seulement ; OZ ID, nom, nationalité, pays, année de naissance et badge restent. Le réglage passe par `oz_player_set_visibility`, qui redécide (compte en état, rôle `player` ou `guardian` tenu, lien, minorité à l'instant de la base) et audite (`player.visibility.updated`) ; un majeur sans compte n'a encore personne pour le régler (D-110) ; une écriture directe de `visibility` sous contexte utilisateur est refusée.

Le téléphone d'un mineur ne reste que pour qui a `player.read_minor_contact` : son tuteur et l'administrateur (CP-11). Aucun tiers ne reçoit la date de naissance complète. Sans lecture permise, aucune vue : l'appelant répond 403 ou 404. Un filet global (`PayloadGuardInterceptor`) bloque toute réponse portant une clé `*Encrypted`, `*Hmac` (hors booléens `isX`, `hasX`, `is_x`, `has_x`), `password`, `*passwordHash`, `*tokenHash`, `*codeHash`, `totpSecret` ou `documentNumber`, ou une valeur binaire hors `StreamableFile`, après `toJSON` : 500 sans le corps d'origine ni les cookies. Chaque vue exige en plus la relation qui la fonde : titulaire avec le rôle joueur, tuteur d'un mineur, administrateur, organisation de rattachement.

## Routes de l'API

Toute route doit figurer ici. `public` : ouverte sans session. `authenticated` : session valide, sans droit particulier : la route n'agit que sur le compte de son titulaire. Une action de la matrice (`document.upload`) : session valide et rôle dont la cellule n'est pas `deny` (`@Can`), 403 sinon ; le service décide ensuite sur la cible.

Les pages `/docs`, `/docs-json` et `/docs-yaml` (Swagger) sont servies hors contrôleur et n'existent pas en production (EX-003 n° 4).

<!-- rbac:routes -->

| Méthode | Route                          | Accès                    |
| ------- | ------------------------------ | ------------------------ |
| GET     | /health                        | public                   |
| GET     | /health/live                   | public                   |
| POST    | /contact                       | public                   |
| GET     | /auth/register/form            | public                   |
| POST    | /auth/register                 | public                   |
| POST    | /auth/verify-email             | public                   |
| POST    | /auth/password/forgot          | public                   |
| POST    | /auth/password/reset           | public                   |
| POST    | /auth/login                    | public                   |
| POST    | /auth/login/2fa                | public                   |
| POST    | /auth/refresh                  | public                   |
| POST    | /auth/logout                   | public                   |
| GET     | /auth/sessions                 | authenticated            |
| DELETE  | /auth/sessions/:id             | authenticated            |
| POST    | /auth/logout-all               | authenticated            |
| POST    | /auth/2fa/setup                | authenticated            |
| POST    | /auth/2fa/enable               | authenticated            |
| POST    | /auth/2fa/disable              | authenticated            |
| POST    | /auth/2fa/recovery-codes       | authenticated            |
| POST    | /auth/phone/start              | authenticated            |
| POST    | /auth/phone/verify             | authenticated            |
| POST    | /documents/upload              | `document.upload`        |
| POST    | /documents/upload/:id/complete | `document.upload`        |
| GET     | /documents/:id/url             | `document.read`          |
| GET     | /players/:ozId                 | `player.read_public`     |
| PATCH   | /players/:ozId/visibility      | `profile.set_visibility` |
| GET     | /admin/audit-log               | `audit.read_log`         |
| GET     | /admin/audit-log/integrity     | `audit.read_log`         |
| POST    | /account/data-export           | authenticated            |
| GET     | /account/data-export           | authenticated            |
| GET     | /account/data-export/download  | authenticated            |
| POST    | /account/deletion              | authenticated            |
| GET     | /account/deletion              | authenticated            |
| DELETE  | /account/deletion              | authenticated            |
