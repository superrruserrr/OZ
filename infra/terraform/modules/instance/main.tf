# Instance d'accueil de Coolify (D4) : entrant refusé par défaut, 80/443 aux plages web (IP
# Cloudflare en 0.8c), SSH par clé aux seules IP d'administration ; Coolify (8000) jamais exposé.
terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.86.0"
    }
  }
}

variable "env" {
  type = string
}

variable "tags" {
  type = list(string)
}

variable "type" {
  type = string
}

variable "image" {
  type    = string
  default = "ubuntu_noble"
}

variable "root_volume_size_gb" {
  type    = number
  default = 40
}

variable "private_network_id" {
  type = string
}

variable "admin_cidrs" {
  type = list(string)

  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for cidr in var.admin_cidrs : endswith(cidr, "/32")])
    error_message = "SSH : au moins une IP d'administration, chacune en /32."
  }
}

variable "web_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "ssh_public_keys" {
  type = list(string)

  validation {
    condition     = length(var.ssh_public_keys) > 0
    error_message = "Au moins une clé SSH publique d'administration."
  }
}

locals {
  web_rules = [for pair in setproduct(var.web_cidrs, [80, 443]) : { ip_range = pair[0], port = pair[1] }]
}

resource "scaleway_instance_security_group" "this" {
  name                    = "oz-${var.env}"
  inbound_default_policy  = "drop"
  outbound_default_policy = "accept"
  stateful                = true
  enable_default_security = true
  tags                    = var.tags

  dynamic "inbound_rule" {
    for_each = var.admin_cidrs
    content {
      action   = "accept"
      protocol = "TCP"
      port     = 22
      ip_range = inbound_rule.value
    }
  }

  dynamic "inbound_rule" {
    for_each = local.web_rules
    content {
      action   = "accept"
      protocol = "TCP"
      port     = inbound_rule.value.port
      ip_range = inbound_rule.value.ip_range
    }
  }
}

resource "scaleway_instance_ip" "this" {
  tags = var.tags
}

resource "scaleway_instance_server" "this" {
  name              = "oz-${var.env}"
  protected         = true
  type              = var.type
  image             = var.image
  ip_id             = scaleway_instance_ip.this.id
  security_group_id = scaleway_instance_security_group.this.id
  tags              = var.tags

  root_volume {
    volume_type           = "sbs_volume"
    size_in_gb            = var.root_volume_size_gb
    delete_on_termination = true
  }

  private_network {
    pn_id = var.private_network_id
  }

  user_data = {
    cloud-init = templatefile("${path.module}/cloud-init.yaml.tftpl", {
      ssh_public_keys = var.ssh_public_keys
    })
  }
}

output "public_ip" {
  value = scaleway_instance_ip.this.address
}

output "server_id" {
  value = scaleway_instance_server.this.id
}
