terraform {
  required_version = "1.16.5"

  required_providers {
    scaleway = {
      source                = "scaleway/scaleway"
      version               = "2.86.0"
      configuration_aliases = [scaleway.ams]
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }
}
