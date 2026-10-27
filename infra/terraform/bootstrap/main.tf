# Bucket de l'état Terraform (D1) : privé, versionné (retour arrière possible), ouvert aux seuls
# administrateurs. L'état contient la clé S3 de l'application (D6) : il se protège comme un secret.
variable "admin_principals" {
  type = list(string)

  validation {
    condition     = length(var.admin_principals) > 0 && alltrue([for p in var.admin_principals : can(regex("^(application_id|user_id):[0-9a-f-]{36}$", p))])
    error_message = "Au moins un principal d'administration, au format application_id:<uuid> ou user_id:<uuid>."
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "scaleway_object_bucket" "state" {
  name = "oz-terraform-state-${random_id.suffix.hex}"
  tags = { oz = "true", env = "shared", managed-by = "terraform" }

  lifecycle {
    prevent_destroy = true
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id                                     = "versions-anciennes"
    enabled                                = true
    abort_incomplete_multipart_upload_days = 7

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "scaleway_object_bucket_acl" "state" {
  bucket = scaleway_object_bucket.state.id
  acl    = "private"
}

resource "scaleway_object_bucket_policy" "state" {
  bucket = scaleway_object_bucket.state.id
  policy = jsonencode({
    Version = "2023-04-17"
    Id      = "oz-terraform-state"
    Statement = [{
      Sid       = "Administrateurs"
      Effect    = "Allow"
      Principal = { SCW = var.admin_principals }
      Action    = ["*"]
      Resource  = [scaleway_object_bucket.state.name, "${scaleway_object_bucket.state.name}/*"]
    }]
  })
}

output "state_bucket" {
  value = scaleway_object_bucket.state.name
}
