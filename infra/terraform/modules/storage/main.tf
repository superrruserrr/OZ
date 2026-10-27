# Stockage objets (TD-010) : buckets séparés, privés, versionnés à Paris ; copies de secours à
# Amsterdam (copie planifiée au lot 0.8d, Scaleway n'ayant pas de réplication native). Chaque bucket
# n'est ouvert qu'à l'application de son environnement et aux administrateurs (politique de bucket).
terraform {
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

variable "env" {
  type = string
}

variable "tags" {
  type = list(string)
}

variable "project_id" {
  type = string
}

# Principaux Scaleway gardant la main sur les buckets (au moins l'application IAM de Terraform),
# sous la forme « application_id:<uuid> » ou « user_id:<uuid> ».
variable "admin_principals" {
  type = list(string)

  validation {
    condition     = length(var.admin_principals) > 0 && alltrue([for p in var.admin_principals : can(regex("^(application_id|user_id):[0-9a-f-]{36}$", p))])
    error_message = "Au moins un principal d'administration, au format application_id:<uuid> ou user_id:<uuid>."
  }
}

variable "secrets_path" {
  type = string
}

variable "key_version" {
  type    = number
  default = 1
}

locals {
  buckets = toset(["identity-documents", "media", "exports"])
  tag_map = { for tag in var.tags : split(":", tag)[0] => try(split(":", tag)[1], "true") }
  app     = "application_id:${scaleway_iam_application.app.id}"
  bucket_policy = {
    for name in local.buckets : name => jsonencode({
      Version = "2023-04-17"
      Id      = "oz-${var.env}-${name}"
      Statement = [
        {
          Sid       = "Administrateurs"
          Effect    = "Allow"
          Principal = { SCW = var.admin_principals }
          Action    = ["*"]
          Resource  = [scaleway_object_bucket.main[name].name, "${scaleway_object_bucket.main[name].name}/*"]
        },
        {
          Sid       = "Application"
          Effect    = "Allow"
          Principal = { SCW = local.app }
          Action    = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
          Resource  = [scaleway_object_bucket.main[name].name, "${scaleway_object_bucket.main[name].name}/*"]
        },
      ]
    })
  }
}

# Noms de bucket uniques chez Scaleway : suffixe aléatoire stable.
resource "random_id" "suffix" {
  byte_length = 4
}

resource "scaleway_object_bucket" "main" {
  for_each = local.buckets

  # Documents d'identité, médias, exports et leurs copies : jamais détruits par Terraform.
  lifecycle {
    prevent_destroy = true
  }
  name = "oz-${var.env}-${each.key}-${random_id.suffix.hex}"
  tags = local.tag_map

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id                                     = "versions-anciennes"
    enabled                                = true
    abort_incomplete_multipart_upload_days = 7

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "scaleway_object_bucket_acl" "main" {
  for_each = scaleway_object_bucket.main
  bucket   = each.value.id
  acl      = "private"
}

resource "scaleway_object_bucket_policy" "main" {
  for_each = scaleway_object_bucket.main
  bucket   = each.value.id
  policy   = local.bucket_policy[each.key]
}

resource "scaleway_object_bucket" "backup" {
  provider = scaleway.ams
  for_each = local.buckets

  # Documents d'identité, médias, exports et leurs copies : jamais détruits par Terraform.
  lifecycle {
    prevent_destroy = true
  }
  name = "oz-${var.env}-${each.key}-secours-${random_id.suffix.hex}"
  tags = local.tag_map

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id                                     = "versions-anciennes"
    enabled                                = true
    abort_incomplete_multipart_upload_days = 7

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "scaleway_object_bucket_acl" "backup" {
  provider = scaleway.ams
  for_each = scaleway_object_bucket.backup
  bucket   = each.value.id
  acl      = "private"
}

resource "scaleway_object_bucket_policy" "backup" {
  provider = scaleway.ams
  for_each = scaleway_object_bucket.backup
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2023-04-17"
    Id      = "oz-${var.env}-${each.key}-secours"
    Statement = [{
      Sid       = "Administrateurs"
      Effect    = "Allow"
      Principal = { SCW = var.admin_principals }
      Action    = ["*"]
      Resource  = [each.value.name, "${each.value.name}/*"]
    }]
  })
}

# Identité de l'application : droits objets sur le projet, restreints bucket par bucket ci-dessus.
resource "scaleway_iam_application" "app" {
  name        = "oz-${var.env}-app"
  description = "API OZ (${var.env}) : accès aux buckets de son environnement."
  tags        = var.tags
}

resource "scaleway_iam_policy" "app" {
  name           = "oz-${var.env}-app-objets"
  application_id = scaleway_iam_application.app.id
  tags           = var.tags

  rule {
    project_ids          = [var.project_id]
    permission_set_names = ["ObjectStorageObjectsRead", "ObjectStorageObjectsWrite", "ObjectStorageObjectsDelete", "ObjectStorageBucketsRead"]
  }
}

# Rotation : incrémenter key_version remplace la clé (et met à jour les secrets).
resource "terraform_data" "key_version" {
  input = var.key_version
}

# Seule valeur secrète présente dans l'état (le fournisseur ne propose pas d'écriture seule ici).
resource "scaleway_iam_api_key" "app" {
  application_id     = scaleway_iam_application.app.id
  default_project_id = var.project_id
  description        = "API OZ (${var.env}), version ${var.key_version}."

  # Nouvelle clé créée et écrite dans Secret Manager avant la suppression de l'ancienne, dans le même
  # apply : l'API, encore sur l'ancienne, perd l'accès au stockage jusqu'à son redéploiement (README).
  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [terraform_data.key_version]
  }
}

locals {
  # Valeurs lues par la configuration de l'API (packages/config) : S3_BUCKET = documents d'identité.
  # Les buckets médias et exports seront branchés par les lots qui les utilisent (sorties ci-dessous).
  s3_secrets = {
    S3_ENDPOINT   = "https://s3.fr-par.scw.cloud"
    S3_REGION     = "fr-par"
    S3_BUCKET     = scaleway_object_bucket.main["identity-documents"].name
    S3_ACCESS_KEY = scaleway_iam_api_key.app.access_key
  }
}

module "s3_config" {
  source   = "../secret"
  for_each = toset(["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY"])

  env           = var.env
  tags          = var.tags
  name          = each.key
  path          = var.secrets_path
  value         = local.s3_secrets[each.key]
  value_version = parseint(substr(sha256(local.s3_secrets[each.key]), 0, 12), 16)
}

module "s3_secret_key" {
  source = "../secret"

  env   = var.env
  tags  = var.tags
  name  = "S3_SECRET_KEY"
  path  = var.secrets_path
  value = scaleway_iam_api_key.app.secret_key
  # Liée à la clé : une clé remplacée réécrit le secret dans le même apply.
  value_version = parseint(substr(sha256(scaleway_iam_api_key.app.id), 0, 12), 16)
}

output "app_principal" {
  value = local.app
}

output "buckets" {
  value = { for name, bucket in scaleway_object_bucket.main : name => bucket.name }
}

output "backup_buckets" {
  value = { for name, bucket in scaleway_object_bucket.backup : name => bucket.name }
}
