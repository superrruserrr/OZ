# infra/terraform

Infrastructure Scaleway en code (lot 0.8b, TD-009, TD-010). Toute modification passe par une PR ; rien ne se crée à la main dans la console, sauf les identifiants d'amorçage décrits ci-dessous.

## Structure

| Dossier                                                     | Rôle                                                                                                   | État                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `bootstrap/`                                                | Bucket de l'état Terraform (privé, versionné, ouvert aux seuls administrateurs)                        | Local, ignoré par Git, à conserver sur le poste d'administration |
| `envs/staging/`                                             | Recette : instance Coolify, PostgreSQL et Redis managés, stockage, secrets                             | Bucket d'état, clé `staging/terraform.tfstate`                   |
| `envs/production/`                                          | Production, mêmes modules, tailles §10.3 — **appliquée au lot 0.11 seulement** (D2)                    | Clé `production/terraform.tfstate`                               |
| `modules/stack/`                                            | Un environnement complet ; ses `tests/` vérifient les propriétés de sécurité sur un fournisseur simulé | —                                                                |
| `modules/{network,instance,postgres,redis,storage,secret}/` | Briques                                                                                                | —                                                                |

Versions figées : Terraform 1.16.5, fournisseurs `scaleway/scaleway` 2.86.0 et `hashicorp/random` 3.9.1. Les `.terraform.lock.hcl` versionnés contiennent les empreintes `darwin_arm64` et `linux_amd64` ; après une montée de version :

```bash
terraform providers lock -platform=darwin_arm64 -platform=linux_amd64
```

## Ce qui protège quoi

- **Base et Redis** : aucun point d'accès public, réseau privé seul ; adresse lue dans l'IPAM et vérifiée non vide. TLS épinglé côté API : la chaîne est vérifiée contre l'autorité de l'instance (`DATABASE_CA_CERT`, `REDIS_CA_CERT`), pas le nom d'hôte (adresse privée absente du certificat), soit l'équivalent de `verify-ca`. Le serveur ne refuse pas une connexion en clair (DEBT D-041).
- **Suppression accidentelle** : `prevent_destroy` sur la base, Redis, tous les buckets et le bucket d'état ; instance et secrets protégés côté Scaleway. Supprimer l'instance PostgreSQL supprimerait aussi ses sauvegardes.
- **Instance** : entrant refusé par défaut ; 80/443 ouverts aux plages `web_cidrs` (IP Cloudflare au lot 0.8c), SSH par clé aux seules IP `admin_cidrs` en `/32` ; Coolify (8000) jamais exposé. Le filtrage est fait par le groupe de sécurité Scaleway, que Docker ne peut pas contourner.
- **Buckets** : privés, versionnés, versions anciennes expirées à 30 jours ; chaque bucket n'est ouvert qu'à l'application IAM de son environnement et aux `admin_principals`. **Tout bucket du projet doit porter une politique** : sans elle, les droits Object Storage de l'application (accordés sur tout le projet) suffiraient pour y accéder (DEBT D-040). Les buckets de secours sont à Amsterdam (copie planifiée au lot 0.8d, DEBT D-034).
- **Secrets** : mots de passe de la base et de Redis, secrets JWT (64 octets, base64) générés comme valeurs éphémères et envoyés en **écriture seule** (`password_wo`, `data_wo`) : ils ne sont ni dans l'état ni dans les sorties, seulement dans Secret Manager sous `/oz/<environnement>/`. Exception : la clé S3 de l'application (`scaleway_iam_api_key`), que le fournisseur garde dans l'état — **l'état se protège donc comme un secret** (bucket dédié, politique d'accès restreinte).

## Identifiants (jamais dans le dépôt, R8)

1. Console Scaleway : créer l'application IAM `oz-terraform`, une politique sur le projet `oz` (droits complets Instances, Bases de données managées, Redis, Object Storage, Secret Manager, VPC, IPAM) et sur l'organisation (`IAMManager` : création de l'application IAM de chaque environnement), puis sa clé d'API.
2. Dans le shell du poste d'administration (gestionnaire de mots de passe → variables, jamais dans un fichier du dépôt) :

```bash
export SCW_ACCESS_KEY=… SCW_SECRET_KEY=… SCW_DEFAULT_PROJECT_ID=…
export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"   # état dans le bucket S3
```

3. Copier `terraform.tfvars.example` en `terraform.tfvars` (ignoré par Git) dans `bootstrap/` et dans l'environnement visé ; `admin_principals` contient `application_id:<id de oz-terraform>` — sans lui, Terraform perd l'accès aux buckets qu'il crée.

## Première application

```bash
cd infra/terraform/bootstrap && terraform init && terraform apply
cd ../envs/staging && terraform init -backend-config="bucket=<sortie state_bucket>"
terraform plan -out=recette.plan   # relire : aucune ressource publique inattendue
terraform apply recette.plan
terraform plan                     # doit annoncer « No changes »
```

Toute application crée ou modifie des ressources facturées : elle est décidée par Gaëtan Wassu au moment de l'exécuter.

## Rotation (§6.9, trimestrielle)

Passer la variable à la valeur suivante dans `terraform.tfvars` de l'environnement (par exemple `postgres_password_version = 2`), puis `plan` et `apply`. **Coupure** : entre l'`apply` et le redéploiement, l'API tourne avec l'ancienne valeur et ses connexions échouent ; enchaîner immédiatement le redéploiement Coolify (lot 0.8d), en heure creuse.

| Variable                    | Effet de l'`apply`                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `postgres_password_version` | Nouveaux mots de passe de `oz_admin`, `oz_app`, `oz_migrator`, réécrits dans `DATABASE_URL` et `DATABASE_MIGRATION_URL` |
| `redis_password_version`    | Nouveau mot de passe Redis, réécrit dans `REDIS_URL`                                                                    |
| `s3_key_version`            | Nouvelle clé de l'application créée, secrets `S3_ACCESS_KEY` et `S3_SECRET_KEY` réécrits, puis ancienne clé supprimée   |
| `jwt_key_version`           | Nouveaux `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` : toutes les sessions sont invalidées                              |

Les versions de secrets suivent aussi chaque rôle PostgreSQL, le cluster Redis et la clé S3 : un utilisateur ou une ressource recréés réécrivent leur secret dans le même `apply` (`tests/rotation.tftest.hcl`).

**Après un `apply` interrompu** (quota, erreur réseau) : les mots de passe éphémères ne sont visibles nulle part, et un secret peut ne plus correspondre à la base ou à Redis. Incrémenter la version de rotation concernée, puis `apply`, pour réaligner les deux ; contrôle : `/health` de l'API.

**Clés SSH d'administration** : `cloud-init` ne s'exécute qu'au premier démarrage, modifier `ssh_public_keys` ne change donc rien sur une instance existante. Rotation : se connecter avec l'ancienne clé, remplacer le contenu de `/etc/ssh/authorized_keys/root`, vérifier une connexion avec la nouvelle dans un second terminal, puis mettre `ssh_public_keys` à jour (pour une future reconstruction). Les clés du trousseau IAM Scaleway sont recopiées par l'image dans `~/.ssh/authorized_keys`, mais `sshd` ne les accepte que depuis la machine et ses réseaux Docker (clé de Coolify).

## Restauration et reconstruction

`docs/runbooks/restauration-postgres.md`, `docs/runbooks/reconstruction-infrastructure.md`.
