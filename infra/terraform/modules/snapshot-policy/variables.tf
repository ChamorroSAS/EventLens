variable "enabled" {
  description = <<-EOT
    Whether the snapshot policy is created.

    It defaults to false. EBS snapshots are a complementary control for the
    operational volumes; they are not the approved recovery path and they do not
    constitute a recovery authority. Enabling this must not be read as a
    substitute for the approved backup and PITR work.
  EOT
  type        = bool
  default     = false
}

variable "permissions_boundary_arn" {
  type    = string
  default = null
  validation {
    condition     = !var.enabled || can(regex("^arn:aws:iam::[0-9]{12}:policy/phoeve-beta-dlm-boundary$", var.permissions_boundary_arn))
    error_message = "An enabled DLM role requires its externally bootstrapped boundary."
  }
}

variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "snapshot_hour_utc" {
  description = "UTC hour at which the daily snapshot window starts."
  type        = string
  default     = "05"
}

variable "retention_count" {
  description = "How many daily snapshots to retain."
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
