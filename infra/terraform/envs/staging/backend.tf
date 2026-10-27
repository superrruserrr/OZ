# État dans le bucket créé par ../../bootstrap ; son nom est passé à l'initialisation :
#   terraform init -backend-config="bucket=<sortie state_bucket du bootstrap>"
terraform {
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "fr-par"
    use_lockfile = true

    endpoints = {
      s3 = "https://s3.fr-par.scw.cloud"
    }

    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
