# Identifiants lus dans l'environnement (SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID) :
# jamais dans le dépôt (R8). Voir infra/terraform/README.md.
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

# Copies de secours hors région (EX-T23.2).
provider "scaleway" {
  alias  = "ams"
  region = "nl-ams"
  zone   = "nl-ams-1"
}
