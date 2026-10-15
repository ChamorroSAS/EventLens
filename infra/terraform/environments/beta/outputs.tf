output "instance_id" {
  description = "Beta host identifier. This is the SSM target used for bootstrap and deployment."
  value       = module.compute.instance_id
}

output "elastic_ip" {
  description = "Stable public address behind the published record."
  value       = module.compute.elastic_ip
}

output "published_url" {
  description = "Public origin the Beta is published on."
  value       = "https://${module.dns.fqdn}"
}

output "database_volume_id" {
  description = "PostgreSQL data volume. Pass it to bootstrap-host.sh --database-volume."
  value       = module.persistent_storage.database_volume_id
}

output "media_volume_id" {
  description = "Media volume. Pass it to bootstrap-host.sh --media-volume."
  value       = module.persistent_storage.media_volume_id
}

output "authority_volume_id" {
  description = "RecoveryAuthority volume, or null while the authority gate is open."
  value       = module.persistent_storage.authority_volume_id
}

output "log_group_name" {
  description = "CloudWatch log group for application logs."
  value       = module.monitoring.log_group_name
}

output "alerts_topic_arn" {
  description = "SNS topic receiving alarms."
  value       = module.monitoring.alerts_topic_arn
}

output "instance_role_name" {
  description = "Role attached to the host. It can read SSM parameters and write logs, nothing else."
  value       = module.compute.instance_role_name
}
