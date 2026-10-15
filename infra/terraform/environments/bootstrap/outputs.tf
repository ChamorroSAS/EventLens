output "github_deploy_role_arn" {
  description = "Set this as the PHOEVE_DEPLOY_ROLE_ARN repository variable in GitHub."
  value       = module.identity.github_deploy_role_arn
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider in use. Null when an existing provider was referenced."
  value       = module.identity.github_oidc_provider_arn
}

output "hcp_plan_role_arn" {
  description = "Plan role for the HCP Terraform workspace. Null while HCP is not configured."
  value       = module.identity.hcp_plan_role_arn
}

output "hcp_apply_role_arn" {
  description = "Apply role for the HCP Terraform workspace. Null while HCP is not configured."
  value       = module.identity.hcp_apply_role_arn
}

output "hcp_oidc_provider_arn" {
  description = "HCP Terraform OIDC provider in use."
  value       = module.identity.hcp_oidc_provider_arn
}
