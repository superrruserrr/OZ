# Runbook — Restaurer PostgreSQL (corruption ou suppression de données)

**Scénario §10.4 :** corruption de base · **Objectifs :** RTO 4 h, RPO 15 min (voir « Limite connue »).
**Écrit pour :** une personne qui n'a pas conçu le système, sous stress. Suivre les étapes dans l'ordre ; noter l'heure de chacune dans le journal d'incident.

## 0. Avant de toucher à quoi que ce soit

1. Déclarer l'incident (canal d'équipe), nommer qui restaure et qui communique.
2. **Arrêter les écritures** : dans Coolify, arrêter `api` et `worker` de l'environnement touché (les pages web restent servies). Une restauration pendant que l'API écrit perd ces écritures.
3. Noter l'**heure du dernier état sain** (première erreur dans Sentry ou les journaux, moins 5 minutes).

## 1. Choisir la sauvegarde

Console Scaleway → _Managed Databases_ → instance `oz-<environnement>` → _Backups_.

- Sauvegardes automatiques : une par jour, conservées 30 jours, stockées hors de Paris (`backup_same_region = false`).
- Prendre la **dernière sauvegarde antérieure** à l'heure du dernier état sain.

En ligne de commande (CLI `scw` configurée avec la clé `oz-terraform`) :

```bash
scw rdb backup list instance-id=<id> region=fr-par
```

## 2. Garder la preuve

Sauvegarde manuelle de l'état actuel, même corrompu (pièce de l'incident, source d'un éventuel rattrapage) :

```bash
scw rdb backup create instance-id=<id> database-name=oz name=preuve-<date> region=fr-par
```

## 3. Restaurer la sauvegarde choisie sur la même instance

```bash
scw rdb backup restore <backup-id> instance-id=<id> database-name=oz region=fr-par
```

Ou console : _Backups_ → sauvegarde choisie → _Restore_ → même instance, base `oz`.

On restaure **la base `oz` sur l'instance existante** : les rôles `oz_app` et `oz_migrator`, leurs mots de passe, l'adresse privée et le certificat appartiennent à l'instance et ne changent pas. Les secrets de Secret Manager restent donc valables et Terraform reste cohérent (aucune ressource recréée).

Si l'instance elle-même est perdue ou inutilisable : suivre `reconstruction-infrastructure.md`.

## 4. Vérifier la base restaurée

Depuis l'instance Coolify (réseau privé), avec l'URL et le certificat lus dans Secret Manager (`/oz/<environnement>/DATABASE_MIGRATION_URL`, `DATABASE_CA_CERT`) :

```bash
scw secret version access-by-path secret-path=/oz/<environnement> secret-name=DATABASE_CA_CERT revision=latest region=fr-par raw=true > /tmp/oz-ca.pem
psql "<DATABASE_MIGRATION_URL sans sslmode>?sslmode=verify-ca&sslrootcert=/tmp/oz-ca.pem" \
  -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;"
rm /tmp/oz-ca.pem
```

Les dernières migrations attendues doivent être présentes ; comparer quelques volumes clés avec le dernier rapport connu.

## 5. Reprendre le service

1. Coolify : redémarrer `api` et `worker`.
2. Fumée : `/health` répond 200 avec `database: up`.
3. `terraform plan` dans `infra/terraform/envs/<environnement>` : « No changes » attendu.

## 6. Clôturer

- Calculer la perte réelle (heure de la sauvegarde restaurée → heure de l'incident) et la consigner.
- Si des données personnelles ont pu être exposées ou perdues : procédure de notification sous 72 h (§6.8).
- Post-mortem sous 5 jours ouvrés.

## Limite connue

Les sauvegardes automatiques configurées sont **quotidiennes**. Tant que la restauration à un instant donné n'est pas confirmée chez Scaleway, la perte maximale est de 24 h, pas de 15 min (EX-T23.4). Voir DEBT D-035.

## Test mensuel (EX-T23.3)

Chaque mois, sur la recette : étapes 1 à 5 (la recette n'a que des données anonymisées). Consigner date, durée et résultat dans `docs/runbooks/journal-restaurations.md`.
