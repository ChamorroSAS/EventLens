output "instance_id" {
  description = "Identifier of the Beta host. Used for the SSM target and the alarms."
  value       = aws_instance.beta.id
}

output "elastic_ip" {
  description = "Stable public address published by DNS."
  value       = aws_eip.beta.public_ip
}

output "private_ip" {
  description = "Private address of the Beta host inside the VPC."
  value       = aws_instance.beta.private_ip
}

output "instance_role_arn" {
  description = "Role attached to the host instance profile."
  value       = aws_iam_role.instance.arn
}

output "instance_role_name" {
  description = "Name of the role attached to the host instance profile."
  value       = aws_iam_role.instance.name
}

output "ami_id" {
  description = "AMI the host was created from."
  value       = aws_instance.beta.ami
}
