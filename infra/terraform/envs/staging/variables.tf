variable "project_id" {
  type = string
}

variable "admin_principals" {
  type = list(string)
}

variable "admin_cidrs" {
  type = list(string)
}

variable "web_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "ssh_public_keys" {
  type = list(string)
}

# Rotation des secrets (README) : incrémenter, puis `plan` et `apply`.
variable "postgres_password_version" {
  type    = number
  default = 1
}

variable "redis_password_version" {
  type    = number
  default = 1
}

variable "s3_key_version" {
  type    = number
  default = 1
}

variable "jwt_key_version" {
  type    = number
  default = 1
}
