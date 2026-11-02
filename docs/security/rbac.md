# Matrice des droits (RBAC)

Référence EX-104 n° 8, lot 1.4a. Ce document **fait foi** : `packages/auth/src/authorization/matrix.test.ts` et `apps/api/test/rbac-matrix.int.test.ts` lisent ces tableaux. Une route absente, une cellule vide ou inconnue fait échouer la CI. La matrice est dérivée de l'Annexe B du document de projet ; les cellules d'abord marquées [À CONFIRMER] ont été tranchées par Gaëtan Wassu le 2026-11-02 (décisions D1 à D7 du lot 1.4a).

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
| `child`       | Sur un joueur dont le compte est le tuteur                                                |
| `org`         | Dans une organisation dont le compte est membre (joueurs rattachés ou organisation visée) |
| `tested`      | Sur un joueur testé par le centre du compte                                               |
| `limited`     | Permis à portée réduite : profils vérifiés, sans export ni critères avancés               |
| `org+limited` | Rattachés sans limite, autres profils vérifiés à portée réduite                           |
| `logged`      | Permis, et chaque accès est journalisé                                                    |
| `kyc3`        | Permis au niveau KYC 3 seulement                                                          |
| `kyc3+org`    | Comme `org`, au niveau KYC 3 seulement                                                    |
| `kyc3+logged` | Permis au niveau KYC 3 seulement, journalisé et visible du tuteur (EX-T16 n° 5)           |

Le niveau KYC n'existe qu'au lot 1.10 : d'ici là, toute valeur `kyc3` est refusée, donc recruteurs et agences n'ont aucun droit (plan §7.3).

## Actions par rôle

La colonne `recruiter` vaut aussi pour l'agence. `player.read_public` ne porte que sur un profil majeur vérifié ; les actions sur un mineur, sur un profil mineur seulement. Un rôle ne compte que si son organisation est vérifiée (plan §7.3). Pour `player.read_minor`, `allow`, `limited`, `tested` et `kyc3+logged` ne valent que sur un mineur vérifié dont le tuteur vérifié a consenti à la publication (EX-T16 n° 3) ; tuteur, joueur, organisation de rattachement et administrateur ne sont pas soumis à cette condition.

<!-- rbac:actions -->

| Action                      | Libellé                                       | player     | guardian | academy     | club  | federation | center | recruiter   | admin  |
| --------------------------- | --------------------------------------------- | ---------- | -------- | ----------- | ----- | ---------- | ------ | ----------- | ------ |
| `profile.read`              | Voir le profil complet                        | self       | child    | deny        | deny  | deny       | deny   | deny        | logged |
| `profile.update`            | Modifier un profil (hors KYC, rôle, statut)   | self-adult | child    | org         | org   | deny       | deny   | deny        | logged |
| `player.create`             | Créer ou importer des joueurs                 | deny       | deny     | org         | org   | deny       | deny   | deny        | allow  |
| `player.read_public`        | Voir un profil majeur vérifié                 | allow      | allow    | allow       | allow | allow      | allow  | kyc3        | allow  |
| `player.search`             | Rechercher des joueurs                        | deny       | deny     | limited     | allow | allow      | deny   | kyc3        | allow  |
| `player.read_club_contact`  | Voir les coordonnées du club ou de l'académie | deny       | deny     | tier        | tier  | allow      | deny   | tier        | allow  |
| `player.read_minor`         | Voir un profil mineur                         | self       | child    | org+limited | allow | allow      | tested | kyc3+logged | logged |
| `player.read_minor_contact` | Voir les coordonnées directes d'un mineur     | deny       | child    | deny        | deny  | deny       | deny   | never       | logged |
| `list.manage`               | Créer des listes et shortlists                | deny       | deny     | allow       | allow | allow      | deny   | kyc3        | deny   |
| `test.certify`              | Saisir et certifier des tests (Phase 2)       | deny       | deny     | deny        | deny  | deny       | allow  | deny        | deny   |
| `test.review`               | Revoir des tests certifiés                    | deny       | deny     | deny        | deny  | deny       | deny   | deny        | allow  |
| `kyc.decide`                | Décider un dossier KYC, valider un compte     | deny       | deny     | deny        | deny  | deny       | deny   | deny        | allow  |
| `kyc.read`                  | Consulter un dossier KYC (appui licences)     | deny       | deny     | deny        | deny  | allow      | deny   | deny        | allow  |
| `audit.read`                | Consulter le journal d'accès d'un profil      | self       | child    | deny        | deny  | deny       | deny   | deny        | allow  |
| `subscription.manage`       | Gérer un abonnement                           | deny       | deny     | org         | org   | org        | org    | kyc3+org    | allow  |

Aucune action ne permet de modifier son rôle, son niveau KYC ou son statut (CP-07) : `profile.update` se décide sur une liste blanche de champs, la même pour tous, administrateur compris. La tutelle s'arrête à la majorité de l'enfant. La revue quatre yeux d'un dossier KYC et la portée exacte de `kyc.read` sont précisées au lot 1.10.

## Routes de l'API

Toute route doit figurer ici. `public` : ouverte sans session. `authenticated` : session valide, sans droit particulier : la route n'agit que sur le compte de son titulaire. Une route métier portera ses rôles en plus de ces valeurs.

Les pages `/docs`, `/docs-json` et `/docs-yaml` (Swagger) sont servies hors contrôleur et n'existent pas en production (EX-003 n° 4).

<!-- rbac:routes -->

| Méthode | Route                    | Accès         |
| ------- | ------------------------ | ------------- |
| GET     | /health                  | public        |
| GET     | /health/live             | public        |
| POST    | /contact                 | public        |
| GET     | /auth/register/form      | public        |
| POST    | /auth/register           | public        |
| POST    | /auth/verify-email       | public        |
| POST    | /auth/password/forgot    | public        |
| POST    | /auth/password/reset     | public        |
| POST    | /auth/login              | public        |
| POST    | /auth/login/2fa          | public        |
| POST    | /auth/refresh            | public        |
| POST    | /auth/logout             | public        |
| GET     | /auth/sessions           | authenticated |
| DELETE  | /auth/sessions/:id       | authenticated |
| POST    | /auth/logout-all         | authenticated |
| POST    | /auth/2fa/setup          | authenticated |
| POST    | /auth/2fa/enable         | authenticated |
| POST    | /auth/2fa/disable        | authenticated |
| POST    | /auth/2fa/recovery-codes | authenticated |
| POST    | /auth/phone/start        | authenticated |
| POST    | /auth/phone/verify       | authenticated |
