# Un secret de Secret Manager et sa version, valeur en écriture seule : jamais dans l'état Terraform.
# Rotation : incrémenter value_version (la nouvelle valeur est alors envoyée).
terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.86.0"
    }
  }
}

variable "env" {
  type = string
}

variable "tags" {
  type    = list(string)
  default = []
}

variable "name" {
  type = string
}

variable "path" {
  type = string
}

variable "value" {
  type      = string
  sensitive = true
  ephemeral = true
}

variable "value_version" {
  type    = number
  default = 1
}

resource "scaleway_secret" "this" {
  name        = var.name
  path        = var.path
  description = "Géré par Terraform (lot 0.8b) ; valeur en écriture seule."
  protected   = true
  tags        = var.tags
}

resource "scaleway_secret_version" "this" {
  secret_id       = scaleway_secret.this.id
  data_wo         = var.value
  data_wo_version = var.value_version
}

output "id" {
  value = scaleway_secret.this.id
}
