# Redis managé (D3) : réseau privé seul, TLS, noeviction (BullMQ). Mot de passe éphémère en
# écriture seule, rangé dans Secret Manager (REDIS_URL).
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

variable "redis_version" {
  type = string
}

variable "private_network_id" {
  type = string
}

variable "secrets_path" {
  type = string
}

variable "password_version" {
  type    = number
  default = 1
}

# Exigences Scaleway : majuscule, minuscule, chiffre et caractère spécial ; « - » et « _ » restent
# sûrs dans une URL.
ephemeral "random_password" "this" {
  length           = 40
  min_upper        = 1
  min_lower        = 1
  min_numeric      = 1
  min_special      = 1
  override_special = "-_"
}

resource "scaleway_redis_cluster" "this" {
  lifecycle {
    prevent_destroy = true
  }

  name                = "oz-${var.env}"
  version             = var.redis_version
  node_type           = var.node_type
  cluster_size        = 1
  user_name           = "oz"
  password_wo         = ephemeral.random_password.this.result
  password_wo_version = var.password_version
  tls_enabled         = true
  tags                = var.tags

  settings = {
    "maxmemory-policy" = "noeviction"
  }

  # Aucun bloc public_network (D4).
  private_network {
    id = var.private_network_id
  }
}

# Adresse attribuée par l'IPAM sur le réseau privé.
data "scaleway_ipam_ip" "redis" {
  private_network_id = var.private_network_id
  type               = "ipv4"

  resource {
    id   = scaleway_redis_cluster.this.id
    type = "redis_cluster"
  }

  lifecycle {
    postcondition {
      condition     = self.address != ""
      error_message = "Adresse privée de Redis introuvable dans l'IPAM."
    }
  }
}

module "secret" {
  source = "../secret"

  env   = var.env
  tags  = var.tags
  name  = "REDIS_URL"
  path  = var.secrets_path
  value = "rediss://oz:${ephemeral.random_password.this.result}@${data.scaleway_ipam_ip.redis.address}:6379"
  # Liée au cluster : un cluster recréé (nouveau mot de passe) réécrit REDIS_URL dans le même apply.
  value_version = parseint(substr(sha256("${scaleway_redis_cluster.this.id}|${var.password_version}"), 0, 12), 16)
}

module "ca" {
  source = "../secret"

  env           = var.env
  tags          = var.tags
  name          = "REDIS_CA_CERT"
  path          = var.secrets_path
  value         = scaleway_redis_cluster.this.certificate
  value_version = parseint(substr(sha256(scaleway_redis_cluster.this.certificate), 0, 12), 16)
}

output "cluster_id" {
  value = scaleway_redis_cluster.this.id
}
