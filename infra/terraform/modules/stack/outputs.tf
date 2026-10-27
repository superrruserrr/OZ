# Aucune sortie secrète : les valeurs sensibles ne vivent que dans Secret Manager.
output "instance_public_ip" {
  value = module.instance.public_ip
}

output "buckets" {
  value = module.storage.buckets
}

output "backup_buckets" {
  value = module.storage.backup_buckets
}

output "secrets_path" {
  value = local.secrets_path
}
