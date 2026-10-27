# Racine d'amorçage : crée le bucket de l'état Terraform. État local (ignoré par Git), à conserver
# sur le poste d'administration ; perdu, il se reconstitue par `terraform import`.
terraform {
  required_version = "1.16.5"

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

provider "scaleway" {
  region = "fr-par"
  zone   = "fr-par-1"
}
