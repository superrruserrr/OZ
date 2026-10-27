# Production (§10.1, §10.3) : écrite et testée, appliquée au lot 0.11 seulement (D2).
# Tailles de départ de Phase 1, à confirmer sur la grille Scaleway avant l'application.
module "stack" {
  source = "../../modules/stack"
  providers = {
    scaleway     = scaleway
    scaleway.ams = scaleway.ams
  }

  env                     = "production"
  project_id              = var.project_id
  admin_principals        = var.admin_principals
  subnet                  = "10.20.0.0/22"
  instance_type           = "POP2-4C-16G"
  admin_cidrs             = var.admin_cidrs
  web_cidrs               = var.web_cidrs
  ssh_public_keys         = var.ssh_public_keys
  postgres_node_type      = "DB-POP2-4C-16G"
  postgres_ha             = true
  postgres_volume_size_gb = 100
  redis_node_type         = "RED1-S"
  redis_version           = "7.2.11"

  postgres_password_version = var.postgres_password_version
  redis_password_version    = var.redis_password_version
  s3_key_version            = var.s3_key_version
  jwt_key_version           = var.jwt_key_version
}
