output "log_group_name" {
  description = "Application log group name, also granted to the instance role."
  value       = aws_cloudwatch_log_group.app.name
}

output "alerts_topic_arn" {
  description = "SNS topic that receives the Preview alarms."
  value       = aws_sns_topic.alerts.arn
}

output "budget_name" {
  description = "Monthly cost budget name."
  value       = aws_budgets_budget.monthly.name
}

output "account_id" {
  description = "Account the budget applies to."
  value       = data.aws_caller_identity.current.account_id
}
