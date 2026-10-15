output "vpc_id" {
  description = "Identifier of the Beta VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Identifier of the public subnet that hosts the Beta instance."
  value       = aws_subnet.public.id
}

output "availability_zone" {
  description = "Availability zone actually used by the subnet."
  value       = local.availability_zone
}

output "edge_security_group_id" {
  description = "Security group attached to the Beta instance (inbound 80/443 only)."
  value       = aws_security_group.edge.id
}

output "region" {
  description = "Region resolved by the provider."
  value       = data.aws_region.current.name
}
