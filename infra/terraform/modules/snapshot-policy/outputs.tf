output "policy_id" {
  description = "Lifecycle policy identifier, or null when the policy is not created."
  value       = var.enabled ? aws_dlm_lifecycle_policy.daily[0].id : null
}

output "execution_role_arn" {
  description = "Role DLM assumes to create snapshots, or null when the policy is not created."
  value       = var.enabled ? aws_iam_role.dlm[0].arn : null
}
