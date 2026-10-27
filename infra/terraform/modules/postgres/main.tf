# PostgreSQL managé (TD-002, TD-009) : réseau privé seul, sauvegarde quotidienne 30 jours hors
# région, chiffrement au repos. Mots de passe éphémères en écriture seule : ni dans l'état, ni en
# sortie ; ils ne vivent que dans Secret Manager (URL de connexion).
terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.86.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }
}

variable "env" {
  type = string
}

variable "tags" {
  type = list(string)
}

variable "node_type" {
  type = string
}

variable "ha" {
  type    = bool
  default = false
}

variable "volume_size_gb" {
  type    = number
  default = 10
}

variable "private_network_id" {
  type = string
}

variable "secrets_path" {
  type = string
}

# Rotation des trois mots de passe : incrémenter (nouvelles valeurs envoyées à la base et aux secrets).
variable "password_version" {
  type    = number
  default = 1
}

ephemeral "random_password" "admin" {
  length  = 40
  special = false
}

ephemeral "random_password" "migrator" {
  length  = 40
  special = false
}

ephemeral "random_password" "app" {
  length  = 40
  special = false
}

resource "scaleway_rdb_instance" "this" {
  # Supprimer l'instance supprime aussi ses sauvegardes automatiques.
  lifecycle {
    prevent_destroy = true
  }

  name                      = "oz-${var.env}"
  engine                    = "PostgreSQL-16"
  node_type                 = var.node_type
  is_ha_cluster             = var.ha
  volume_type               = "sbs_5k"
  volume_size_in_gb         = var.volume_size_gb
  encryption_at_rest        = true
  disable_backup            = false
  backup_schedule_frequency = 24
  backup_schedule_retention = 30
  backup_same_region        = false
  user_name                 = "oz_admin"
  password_wo               = ephemeral.random_password.admin.result
  password_wo_version       = var.password_version
  tags                      = var.tags

  # Aucun bloc load_balancer : pas de point d'accès public (D4).
  private_network {
    pn_id       = var.private_network_id
    enable_ipam = true
  }
}

resource "scaleway_rdb_database" "oz" {
  instance_id = scaleway_rdb_instance.this.id
  name        = "oz"
}

resource "scaleway_rdb_user" "migrator" {
  instance_id         = scaleway_rdb_instance.this.id
  name                = "oz_migrator"
  password_wo         = ephemeral.random_password.migrator.result
  password_wo_version = var.password_version
  is_admin            = false
}

resource "scaleway_rdb_user" "app" {
  instance_id         = scaleway_rdb_instance.this.id
  name                = "oz_app"
  password_wo         = ephemeral.random_password.app.result
  password_wo_version = var.password_version
  is_admin            = false
}

resource "scaleway_rdb_privilege" "migrator" {
  instance_id   = scaleway_rdb_instance.this.id
  database_name = scaleway_rdb_database.oz.name
  user_name     = scaleway_rdb_user.migrator.name
  permission    = "all"
}

resource "scaleway_rdb_privilege" "app" {
  instance_id   = scaleway_rdb_instance.this.id
  database_name = scaleway_rdb_database.oz.name
  user_name     = scaleway_rdb_user.app.name
  permission    = "readwrite"
}

# Adresse attribuée par l'IPAM : une adresse vide produirait une URL invalide, invisible (écriture seule).
data "scaleway_ipam_ip" "postgres" {
  private_network_id = var.private_network_id
  type               = "ipv4"

  resource {
    id   = scaleway_rdb_instance.this.id
    type = "rdb_instance"
  }

  lifecycle {
    postcondition {
      condition     = self.address != ""
      error_message = "Adresse privée de la base introuvable dans l'IPAM."
    }
  }
}

# Une époque par rôle, renouvelée à chaque création ou modification de l'utilisateur (nouveau mot de
# passe, utilisateur recréé seul ou avec l'instance). L'identifiant d'un utilisateur Scaleway dérive de
# son nom et ne change pas quand il est recréé : il ne peut pas servir de version.
resource "terraform_data" "app_password_epoch" {
  lifecycle {
    replace_triggered_by = [scaleway_rdb_user.app]
  }
}

resource "terraform_data" "migrator_password_epoch" {
  lifecycle {
    replace_triggered_by = [scaleway_rdb_user.migrator]
  }
}

locals {
  endpoint = "${data.scaleway_ipam_ip.postgres.address}:${scaleway_rdb_instance.this.private_network[0].port}"
  # Version de chaque URL liée à son rôle : un mot de passe réécrit l'est aussi dans Secret Manager,
  # dans le même apply, au lieu de laisser l'ancienne valeur en place.
  secret_versions = {
    DATABASE_URL           = parseint(substr(sha256(terraform_data.app_password_epoch.id), 0, 12), 16)
    DATABASE_MIGRATION_URL = parseint(substr(sha256(terraform_data.migrator_password_epoch.id), 0, 12), 16)
  }
}

module "secret" {
  source = "../secret"
  # Clés connues au plan ; les mots de passe éphémères ne peuvent pas entrer dans for_each.
  for_each = {
    DATABASE_URL           = scaleway_rdb_user.app.name
    DATABASE_MIGRATION_URL = scaleway_rdb_user.migrator.name
  }

  env  = var.env
  tags = var.tags
  name = each.key
  path = var.secrets_path
  value = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    each.value,
    each.key == "DATABASE_URL" ? ephemeral.random_password.app.result : ephemeral.random_password.migrator.result,
    local.endpoint,
    scaleway_rdb_database.oz.name,
  )
  value_version = local.secret_versions[each.key]
}

# Autorité de l'instance (publique) : l'API vérifie la chaîne TLS contre elle (D-006).
module "ca" {
  source = "../secret"

  env           = var.env
  tags          = var.tags
  name          = "DATABASE_CA_CERT"
  path          = var.secrets_path
  value         = scaleway_rdb_instance.this.certificate
  value_version = parseint(substr(sha256(scaleway_rdb_instance.this.certificate), 0, 12), 16)
}

output "secret_versions" {
  description = "Version écrite de chaque URL (tests de rotation)."
  value       = local.secret_versions
}

output "instance_id" {
  value = scaleway_rdb_instance.this.id
}
