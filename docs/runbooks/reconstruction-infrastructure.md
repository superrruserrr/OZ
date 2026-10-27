# Runbook — Reconstruire un environnement (perte de l'hébergement ou du projet)

**Scénario §10.4 :** perte de l'hébergeur ou d'un environnement · **Objectifs :** RTO 24 h, RPO 15 min (voir `restauration-postgres.md`, « Limite connue »).
**Écrit pour :** une personne qui n'a pas conçu le système. Tout l'environnement est décrit dans `infra/terraform` : on le recrée, puis on y remet les données.

## 0. Prérequis

- Accès au dépôt Git et au gestionnaire de mots de passe de l'équipe.
- Terraform 1.16.5 (`infra/terraform/README.md`).
- Une clé d'API Scaleway de l'application IAM `oz-terraform` (à recréer dans la console si elle est perdue, avec la politique décrite dans le README).

## 1. Où en est l'état Terraform ?

L'état (`<environnement>/terraform.tfstate`) vit dans le bucket `oz-terraform-state-…`, versionné. Identifiants S3 : ceux de `oz-terraform` (README).

```bash
aws s3api list-object-versions --endpoint-url https://s3.fr-par.scw.cloud \
  --bucket <bucket d'état> --prefix <environnement>/
```

| Situation                                            | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le fichier d'état est là et sain                     | Étape 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Le fichier est supprimé ou corrompu                  | Recopier la dernière version saine : `aws s3api copy-object --endpoint-url https://s3.fr-par.scw.cloud --bucket <bucket> --key <environnement>/terraform.tfstate --copy-source "<bucket>/<environnement>/terraform.tfstate?versionId=<version>"`, puis étape 2                                                                                                                                                                                                                                 |
| Plus aucun état, mais les ressources existent encore | **Ne pas lancer `apply`** : il créerait des doublons (buckets vides à côté des anciens) et échouerait sur les secrets protégés. Rattacher chaque ressource existante : `terraform plan` liste les adresses, puis `terraform import '<adresse>' <identifiant Scaleway>` pour l'instance, la base, Redis, les buckets, les secrets. Les versions de secrets ne s'importent pas : incrémenter ensuite les quatre versions de rotation (README) pour réécrire des valeurs connues, puis redéployer |
| Projet perdu (bucket d'état compris)                 | `cd infra/terraform/bootstrap && terraform apply` crée un nouveau bucket d'état ; noter son nom, étape 2                                                                                                                                                                                                                                                                                                                                                                                       |

## 2. Recréer l'environnement

```bash
cd infra/terraform/envs/<environnement>
cp terraform.tfvars.example terraform.tfvars   # remplir : projet, application oz-terraform, IP d'administration, clé SSH
terraform init -backend-config="bucket=<bucket d'état>" -reconfigure
terraform plan -out=reconstruction.plan
terraform apply reconstruction.plan
```

Résultat : réseau privé, instance, PostgreSQL et Redis vides, buckets vides, **nouveaux secrets** dans Secret Manager (`/oz/<environnement>/`).

## 3. Remettre les données

1. **Base** : si l'ancienne instance existe encore avec ses sauvegardes, restaurer la plus récente dans la nouvelle : `scw rdb backup restore <backup-id> instance-id=<nouvelle instance> database-name=oz region=fr-par` (les rôles `oz_app` et `oz_migrator` portent les mêmes noms, avec les nouveaux mots de passe de Secret Manager). Supprimer une instance supprime ses sauvegardes automatiques : si elle est perdue, partir de la dernière copie hors site (aucune automatisée à ce jour, DEBT D-034 et D-035).
2. **Objets** : copier les buckets de secours d'Amsterdam vers les nouveaux buckets de Paris :

```bash
rclone sync scw-ams:<bucket de secours> scw-par:<nouveau bucket> --checksum
```

(Tant que la copie planifiée n'existe pas — DEBT D-034 — les buckets de secours peuvent être vides : les objets créés depuis la dernière copie manuelle sont perdus.)

## 4. Redéployer

Coolify (lot 0.8d) : installer sur la nouvelle instance, reconnecter le dépôt, recharger les variables depuis Secret Manager, déployer `api`, `web`, `admin`, `worker`, ClamAV. Mettre à jour le DNS Cloudflare vers la nouvelle IP publique (`terraform output instance_public_ip`).

## 5. Vérifier puis clôturer

- `/health` à 200 ; fumée de la recette ; connexion d'un compte de test.
- Consigner la durée réelle de reconstruction (RTO) et la perte de données (RPO) ; post-mortem sous 5 jours ouvrés.
