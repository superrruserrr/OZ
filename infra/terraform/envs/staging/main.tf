# Recette (§10.1) : données anonymisées, une instance pour Coolify et les applications.
module "stack" {
  source = "../../modules/stack"
  providers = {
    scaleway     = scaleway
    scaleway.ams = scaleway.ams
  }

  env                     = "staging"
  project_id              = var.project_id
  admin_principals        = var.admin_principals
  subnet                  = "10.10.0.0/22"
  instance_type           = "DEV1-L"
  admin_cidrs             = var.admin_cidrs
  web_cidrs               = var.web_cidrs
  ssh_public_keys         = var.ssh_public_keys
  postgres_node_type      = "DB-DEV-S"
  postgres_ha             = false
  postgres_volume_size_gb = 10
  redis_node_type         = "RED1-MICRO"
  redis_version           = "7.2.11"

  postgres_password_version = var.postgres_password_version
  redis_password_version    = var.redis_password_version
  s3_key_version            = var.s3_key_version
  jwt_key_version           = var.jwt_key_version
}
