variable "env" {
  type = string

  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env : staging ou production."
  }
}

variable "project_id" {
  type = string
}

variable "admin_principals" {
  type = list(string)
}

variable "subnet" {
  type = string
}

variable "instance_type" {
  type = string
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

variable "postgres_node_type" {
  type = string
}

variable "postgres_ha" {
  type = bool
}

variable "postgres_volume_size_gb" {
  type = number
}

variable "redis_node_type" {
  type = string
}

variable "redis_version" {
  type = string
}

# Rotation des secrets (README, §6.9) : incrémenter puis appliquer.
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
