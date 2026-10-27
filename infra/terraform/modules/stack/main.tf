# Un environnement OZ complet (recette ou production) : mêmes modules, tailles différentes (D2).
locals {
  tags         = ["oz", "env:${var.env}", "managed-by:terraform"]
  secrets_path = "/oz/${var.env}"
}

module "network" {
  source = "../network"

  env    = var.env
  tags   = local.tags
  subnet = var.subnet
}

module "instance" {
  source = "../instance"

  env                = var.env
  tags               = local.tags
  type               = var.instance_type
  private_network_id = module.network.private_network_id
  admin_cidrs        = var.admin_cidrs
  web_cidrs          = var.web_cidrs
  ssh_public_keys    = var.ssh_public_keys
}

module "postgres" {
  source = "../postgres"

  env                = var.env
  tags               = local.tags
  node_type          = var.postgres_node_type
  ha                 = var.postgres_ha
  volume_size_gb     = var.postgres_volume_size_gb
  private_network_id = module.network.private_network_id
  secrets_path       = local.secrets_path
  password_version   = var.postgres_password_version
}

module "redis" {
  source = "../redis"

  env                = var.env
  tags               = local.tags
  node_type          = var.redis_node_type
  redis_version      = var.redis_version
  private_network_id = module.network.private_network_id
  secrets_path       = local.secrets_path
  password_version   = var.redis_password_version
}

module "storage" {
  source = "../storage"
  providers = {
    scaleway     = scaleway
    scaleway.ams = scaleway.ams
  }

  env              = var.env
  tags             = local.tags
  project_id       = var.project_id
  admin_principals = var.admin_principals
  secrets_path     = local.secrets_path
  key_version      = var.s3_key_version
}

# Secrets JWT : 64 octets aléatoires en base64 (comme .env.example), propres à chaque environnement.
ephemeral "random_bytes" "jwt" {
  for_each = toset(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"])
  length   = 64
}

module "jwt" {
  source   = "../secret"
  for_each = toset(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"])

  env           = var.env
  tags          = local.tags
  name          = each.key
  path          = local.secrets_path
  value         = ephemeral.random_bytes.jwt[each.key].base64
  value_version = var.jwt_key_version
}
