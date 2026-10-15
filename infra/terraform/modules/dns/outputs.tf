output "fqdn" {
  description = "Fully qualified domain name published for the Beta."
  value       = aws_route53_record.beta.fqdn
}

output "record_name" {
  description = "Record name as configured."
  value       = aws_route53_record.beta.name
}
