output "github_deploy_role_arn" {
  description = "Role ARN for the GitHub Actions deployment workflow (repository variable PHOEVE_DEPLOY_ROLE_ARN)."
  value       = aws_iam_role.github_deploy.arn
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider in use."
  value       = local.github_provider_arn
}

output "deploy_document_name" {
  description = "Name of the restricted SSM document the deployment workflow may invoke (no shell document is allowed)."
  value       = aws_ssm_document.deploy.name
}

output "deploy_document_arn" {
  description = "ARN of the restricted SSM document, and the only document the deploy role can send commands to."
  value       = aws_ssm_document.deploy.arn
}

output "hcp_plan_role_arn" {
  description = "Role ARN that the HCP Terraform workspace assumes for plan runs."
  value       = local.hcp_enabled ? aws_iam_role.hcp_plan[0].arn : null
}

output "hcp_apply_role_arn" {
  description = "Role ARN that the HCP Terraform workspace assumes for apply runs."
  value       = local.hcp_enabled ? aws_iam_role.hcp_apply[0].arn : null
}

output "hcp_oidc_provider_arn" {
  description = "HCP Terraform OIDC provider in use."
  value       = local.hcp_provider_arn
}
