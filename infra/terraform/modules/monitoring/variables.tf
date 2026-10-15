variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "instance_id" {
  description = "Instance monitored by the basic alarms."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group for application logs."
  type        = string
}

variable "log_retention_days" {
  description = "Log retention. Short retention keeps storage cost predictable during the Preview."
  type        = number
  default     = 30
}

variable "alert_emails" {
  description = "Addresses subscribed to the alert topic. Each subscription must be confirmed by its owner."
  type        = list(string)
  default     = []
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget for the Beta account scope."
  type        = number
  default     = 60
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
