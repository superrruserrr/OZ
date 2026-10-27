# VPC et réseau privé de l'environnement : la base et Redis n'existent que sur ce réseau (D4).
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

variable "subnet" {
  type = string
}

resource "scaleway_vpc" "this" {
  name = "oz-${var.env}"
  tags = var.tags
}

resource "scaleway_vpc_private_network" "this" {
  name   = "oz-${var.env}"
  vpc_id = scaleway_vpc.this.id
  tags   = var.tags

  ipv4_subnet {
    subnet = var.subnet
  }
}

output "private_network_id" {
  value = scaleway_vpc_private_network.this.id
}
