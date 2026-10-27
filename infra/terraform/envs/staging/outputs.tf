output "instance_public_ip" {
  value = module.stack.instance_public_ip
}

output "buckets" {
  value = module.stack.buckets
}

output "backup_buckets" {
  value = module.stack.backup_buckets
}

output "secrets_path" {
  value = module.stack.secrets_path
}
