output "database_volume_id" {
  description = "PostgreSQL data volume identifier."
  value       = aws_ebs_volume.database.id
}

output "media_volume_id" {
  description = "Media volume identifier."
  value       = aws_ebs_volume.media.id
}

output "authority_volume_id" {
  description = "RecoveryAuthority volume identifier, or null when the volume is not created."
  value       = var.create_authority_volume ? aws_ebs_volume.authority[0].id : null
}

output "region" {
  description = "Region resolved by the provider."
  value       = data.aws_region.current.name
}
