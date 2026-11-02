# Propriétés de sécurité de chaque module (lot 0.8b), vérifiées sans compte Scaleway :
# fournisseur simulé, `apply` en mémoire. Lancé par la CI (`terraform test`).

mock_provider "scaleway" {
  mock_resource "scaleway_vpc" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_vpc_private_network" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_instance_ip" {
    defaults = { id = "fr-par-1/11111111-1111-1111-1111-111111111111", address = "192.0.2.10" }
  }
  mock_resource "scaleway_instance_security_group" {
    defaults = { id = "fr-par-1/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_rdb_instance" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_redis_cluster" {
    defaults = { id = "fr-par-1/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_secret" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_object_bucket" {
    defaults = { id = "fr-par/oz-staging-bucket" }
  }
  mock_resource "scaleway_iam_application" {
    defaults = { id = "33333333-3333-3333-3333-333333333333" }
  }
}

mock_provider "scaleway" {
  alias = "ams"

  mock_resource "scaleway_object_bucket" {
    defaults = { id = "nl-ams/oz-staging-bucket", region = "nl-ams" }
  }
}

variables {
  env  = "staging"
  tags = ["oz", "env:staging", "managed-by:terraform"]
}

run "network_prive" {
  command = apply

  module {
    source = "../network"
  }

  variables {
    subnet = "10.10.0.0/22"
  }

  assert {
    condition     = scaleway_vpc_private_network.this.ipv4_subnet[0].subnet == "10.10.0.0/22"
    error_message = "Le réseau privé doit utiliser le sous-réseau demandé."
  }

  assert {
    condition     = scaleway_vpc.this.tags == var.tags && scaleway_vpc_private_network.this.tags == var.tags
    error_message = "Étiquettes oz, env:<env>, managed-by:terraform."
  }
}

run "instance_durcie" {
  command = apply

  module {
    source = "../instance"
  }

  variables {
    type               = "DEV1-L"
    private_network_id = "fr-par/11111111-1111-1111-1111-111111111111"
    admin_cidrs        = ["203.0.113.10/32"]
    web_cidrs          = ["0.0.0.0/0"]
    ssh_public_keys    = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleExempleExempleExempleExempleExemple oz-admin"]
  }

  assert {
    condition     = scaleway_instance_security_group.this.inbound_default_policy == "drop"
    error_message = "Tout trafic entrant non listé doit être refusé."
  }

  # Contrat exact : SSH depuis l'IP d'administration, 80/443 depuis les plages web, rien d'autre
  # (ni 8000 de Coolify, ni règle sans adresse source).
  assert {
    condition = toset([
      for rule in scaleway_instance_security_group.this.inbound_rule :
      "${rule.action} ${rule.protocol} ${rule.port} ${rule.ip_range}"
    ]) == toset(["accept TCP 22 203.0.113.10/32", "accept TCP 80 0.0.0.0/0", "accept TCP 443 0.0.0.0/0"])
    error_message = "Seuls 22 (administration), 80 et 443 (web) sont ouverts."
  }

  assert {
    condition     = scaleway_instance_server.this.protected
    error_message = "L'instance est protégée contre la suppression."
  }

  assert {
    condition = alltrue([
      for needle in [
        "PasswordAuthentication no",
        "AuthorizedKeysFile /etc/ssh/authorized_keys/%u\n",
        "path: /etc/ssh/authorized_keys/root",
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleExempleExempleExempleExempleExemple oz-admin",
        "Unattended-Upgrade::Automatic-Reboot \"true\"",
        "APT::Periodic::Unattended-Upgrade \"1\"",
      ] : strcontains(scaleway_instance_server.this.user_data["cloud-init"], needle)
    ])
    error_message = "cloud-init : clés d'administration seules depuis l'extérieur, pas de mot de passe, mises à jour et redémarrage automatiques."
  }

  assert {
    condition     = length(scaleway_instance_server.this.private_network) == 1 && scaleway_instance_server.this.private_network[0].pn_id == var.private_network_id
    error_message = "L'instance doit être attachée au réseau privé."
  }

  assert {
    condition = alltrue([
      for tags in [scaleway_instance_security_group.this.tags, scaleway_instance_ip.this.tags, scaleway_instance_server.this.tags] :
      tags == var.tags
    ])
    error_message = "Étiquettes oz, env:<env>, managed-by:terraform."
  }
}

run "ssh_admin_obligatoire" {
  command = plan

  module {
    source = "../instance"
  }

  variables {
    type               = "DEV1-L"
    private_network_id = "fr-par/11111111-1111-1111-1111-111111111111"
    admin_cidrs        = ["0.0.0.0/0"]
    ssh_public_keys    = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleExempleExempleExempleExempleExemple oz-admin"]
  }

  expect_failures = [var.admin_cidrs]
}

run "postgres_prive_et_sauvegarde" {
  command = apply

  module {
    source = "../postgres"
  }

  variables {
    node_type          = "DB-DEV-S"
    private_network_id = "fr-par/11111111-1111-1111-1111-111111111111"
    secrets_path       = "/oz/staging"
  }

  assert {
    condition     = length(scaleway_rdb_instance.this.load_balancer) == 0
    error_message = "La base ne doit avoir aucun point d'accès public."
  }

  assert {
    condition     = length(scaleway_rdb_instance.this.private_network) == 1 && scaleway_rdb_instance.this.private_network[0].pn_id == var.private_network_id
    error_message = "La base doit être joignable par le réseau privé."
  }

  assert {
    condition     = scaleway_rdb_instance.this.engine == "PostgreSQL-16"
    error_message = "Même version majeure qu'en local et en CI (16)."
  }

  assert {
    condition = (
      scaleway_rdb_instance.this.disable_backup == false &&
      scaleway_rdb_instance.this.backup_schedule_frequency == 24 &&
      scaleway_rdb_instance.this.backup_schedule_retention == 30
    )
    error_message = "Sauvegarde quotidienne conservée 30 jours (EX-T23.1)."
  }

  assert {
    condition     = scaleway_rdb_instance.this.backup_same_region == false && scaleway_rdb_instance.this.encryption_at_rest
    error_message = "Sauvegardes hors région et chiffrement au repos exigés."
  }

  assert {
    condition     = scaleway_rdb_privilege.app.permission == "readwrite" && scaleway_rdb_privilege.migrator.permission == "all" && scaleway_rdb_privilege.worker.permission == "readonly"
    error_message = "oz_app lit et écrit les données ; seul oz_migrator modifie le schéma ; oz_worker ne fait que lire (verdicts par fonctions dédiées)."
  }

  assert {
    condition     = scaleway_rdb_user.app.is_admin == false && scaleway_rdb_user.migrator.is_admin == false && scaleway_rdb_user.worker.is_admin == false
    error_message = "Aucun rôle applicatif n'est administrateur."
  }

  assert {
    condition     = toset(keys(module.secret)) == toset(["DATABASE_URL", "DATABASE_MIGRATION_URL", "WORKER_DATABASE_URL"]) && module.ca.id != ""
    error_message = "URL de connexion des trois rôles et autorité de l'instance rangées dans Secret Manager."
  }

  assert {
    condition     = data.scaleway_ipam_ip.postgres.private_network_id == var.private_network_id && data.scaleway_ipam_ip.postgres.resource[0].type == "rdb_instance"
    error_message = "L'adresse de la base vient de l'IPAM du réseau privé."
  }

  assert {
    condition     = scaleway_rdb_instance.this.tags == var.tags
    error_message = "Étiquettes oz, env:<env>, managed-by:terraform."
  }
}

run "redis_prive" {
  command = apply

  module {
    source = "../redis"
  }

  variables {
    node_type          = "RED1-MICRO"
    redis_version      = "7.2.11"
    private_network_id = "fr-par/11111111-1111-1111-1111-111111111111"
    secrets_path       = "/oz/staging"
  }

  assert {
    condition     = length(scaleway_redis_cluster.this.public_network) == 0 && length(scaleway_redis_cluster.this.private_network) == 1
    error_message = "Redis ne doit être joignable que par le réseau privé."
  }

  assert {
    condition     = scaleway_redis_cluster.this.tls_enabled && scaleway_redis_cluster.this.settings["maxmemory-policy"] == "noeviction"
    error_message = "TLS exigé ; noeviction pour BullMQ."
  }

  assert {
    condition     = module.ca.id != "" && module.secret.id != ""
    error_message = "REDIS_URL et l'autorité du cluster rangées dans Secret Manager."
  }

  assert {
    condition     = scaleway_redis_cluster.this.tags == var.tags
    error_message = "Étiquettes oz, env:<env>, managed-by:terraform."
  }
}

run "stockage_recette" {
  command = apply

  module {
    source = "../storage"
  }

  providers = {
    scaleway     = scaleway
    scaleway.ams = scaleway.ams
  }

  variables {
    project_id       = "11111111-1111-1111-1111-111111111111"
    admin_principals = ["application_id:22222222-2222-2222-2222-222222222222"]
    secrets_path     = "/oz/staging"
  }

  assert {
    condition     = toset(keys(scaleway_object_bucket.main)) == toset(["identity-documents", "media", "exports"])
    error_message = "Trois buckets séparés : documents d'identité, médias, exports."
  }

  assert {
    condition = alltrue([
      for bucket in concat(values(scaleway_object_bucket.main), values(scaleway_object_bucket.backup)) :
      bucket.versioning[0].enabled
    ])
    error_message = "Versioning activé sur tous les buckets (EX-T23.2)."
  }

  assert {
    condition = alltrue([
      for acl in concat(values(scaleway_object_bucket_acl.main), values(scaleway_object_bucket_acl.backup)) :
      acl.acl == "private"
    ])
    error_message = "Aucun bucket public (URL signées seulement, EX-110)."
  }

  assert {
    condition     = alltrue([for bucket in values(scaleway_object_bucket.backup) : bucket.region == "nl-ams"])
    error_message = "Les buckets de secours sont à Amsterdam."
  }

  assert {
    condition = alltrue([
      for bucket in values(scaleway_object_bucket.main) :
      bucket.lifecycle_rule[0].noncurrent_version_expiration[0].noncurrent_days == 30 &&
      bucket.lifecycle_rule[0].abort_incomplete_multipart_upload_days == 7
    ])
    error_message = "Versions anciennes expirées à 30 jours ; envois incomplets nettoyés."
  }

  # Une politique par bucket, sans exception : sans elle, tout principal du projet ayant des droits
  # Object Storage atteindrait le bucket.
  assert {
    condition = (
      keys(scaleway_object_bucket_policy.main) == keys(scaleway_object_bucket.main) &&
      keys(scaleway_object_bucket_policy.backup) == keys(scaleway_object_bucket.backup)
    )
    error_message = "Chaque bucket porte sa politique d'accès."
  }

  assert {
    condition = alltrue([
      for name, policy in scaleway_object_bucket_policy.main : (
        jsondecode(policy.policy).Version == "2023-04-17" &&
        toset(flatten([for st in jsondecode(policy.policy).Statement : st.Principal.SCW])) ==
        toset(["application_id:22222222-2222-2222-2222-222222222222", output.app_principal]) &&
        alltrue([
          for st in jsondecode(policy.policy).Statement :
          toset(st.Resource) == toset([scaleway_object_bucket.main[name].name, "${scaleway_object_bucket.main[name].name}/*"])
        ])
      )
    ])
    error_message = "Chaque bucket n'est ouvert qu'aux administrateurs et à l'application de son environnement, sur lui seul."
  }

  assert {
    condition = alltrue([
      for policy in values(scaleway_object_bucket_policy.main) :
      toset([for st in jsondecode(policy.policy).Statement : join(",", st.Action) if st.Principal.SCW == output.app_principal]) ==
      toset(["s3:GetObject,s3:PutObject,s3:DeleteObject,s3:ListBucket"])
    ])
    error_message = "L'application lit, écrit, supprime et liste les objets, sans droit sur la configuration du bucket."
  }

  assert {
    condition = alltrue([
      for policy in values(scaleway_object_bucket_policy.backup) :
      !strcontains(policy.policy, output.app_principal)
    ])
    error_message = "Les buckets de secours sont fermés à l'application."
  }

  # Étanchéité recette / production : chaque environnement a sa propre application IAM, seule
  # autorisée (avec les administrateurs) par les politiques ci-dessus.
  assert {
    condition     = scaleway_iam_application.app.name == "oz-staging-app" && output.app_principal == "application_id:${scaleway_iam_application.app.id}"
    error_message = "L'application IAM est propre à l'environnement."
  }

  assert {
    condition     = toset(keys(module.s3_config)) == toset(["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY"]) && module.s3_secret_key.id != ""
    error_message = "Toutes les variables S3 lues par l'API sont rangées dans Secret Manager."
  }

  assert {
    condition     = alltrue([for bucket in values(scaleway_object_bucket.main) : startswith(bucket.name, "oz-staging-") && bucket.tags == tomap({ oz = "true", env = "staging", managed-by = "terraform" })])
    error_message = "Le nom et les étiquettes du bucket portent son environnement."
  }
}

run "secret_ecriture_seule" {
  command = apply

  module {
    source = "../secret"
  }

  variables {
    name  = "JWT_ACCESS_SECRET"
    path  = "/oz/staging"
    value = "valeur-de-test"
  }

  assert {
    condition     = scaleway_secret.this.path == "/oz/staging" && scaleway_secret.this.protected && scaleway_secret.this.tags == var.tags
    error_message = "Un chemin par environnement ; secret protégé contre la suppression ; étiqueté."
  }
}

run "environnement_complet" {
  command = apply

  variables {
    project_id              = "11111111-1111-1111-1111-111111111111"
    admin_principals        = ["application_id:22222222-2222-2222-2222-222222222222"]
    subnet                  = "10.10.0.0/22"
    instance_type           = "DEV1-L"
    admin_cidrs             = ["203.0.113.10/32"]
    ssh_public_keys         = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleExempleExempleExempleExempleExemple oz-admin"]
    postgres_node_type      = "DB-DEV-S"
    postgres_ha             = false
    postgres_volume_size_gb = 10
    redis_node_type         = "RED1-MICRO"
    redis_version           = "7.2.11"
  }

  assert {
    condition     = output.secrets_path == "/oz/staging"
    error_message = "Les secrets de la recette vivent sous /oz/staging."
  }

  assert {
    condition     = length(output.buckets) == 3 && length(output.backup_buckets) == 3
    error_message = "Trois buckets et leurs trois copies de secours."
  }

  assert {
    condition     = length(module.jwt) == 2
    error_message = "Secrets JWT d'accès et de rafraîchissement propres à l'environnement."
  }
}

run "environnement_inconnu" {
  command = plan

  variables {
    env                     = "prod"
    project_id              = "11111111-1111-1111-1111-111111111111"
    admin_principals        = ["application_id:22222222-2222-2222-2222-222222222222"]
    subnet                  = "10.10.0.0/22"
    instance_type           = "DEV1-L"
    admin_cidrs             = ["203.0.113.10/32"]
    ssh_public_keys         = ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExempleExempleExempleExempleExempleExemple oz-admin"]
    postgres_node_type      = "DB-DEV-S"
    postgres_ha             = false
    postgres_volume_size_gb = 10
    redis_node_type         = "RED1-MICRO"
    redis_version           = "7.2.11"
  }

  expect_failures = [var.env]
}
