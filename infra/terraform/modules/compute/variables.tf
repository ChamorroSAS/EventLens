variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "permissions_boundary_arn" {
  type     = string
  nullable = false
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/phoeve-beta-workload-boundary$", var.permissions_boundary_arn))
    error_message = "The instance role requires the externally managed workload boundary."
  }
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet that hosts the instance."
  type        = string
}

variable "security_group_ids" {
  description = "Security groups attached to the instance."
  type        = list(string)
}

variable "instance_type" {
  description = "Instance class. ARM64 (Graviton) keeps the Preview cost low; confirm the exact class before applying."
  type        = string
  default     = "t4g.medium"
}

variable "ami_id" {
  description = "Explicit AMI identifier. When null, the latest Amazon Linux 2023 ARM64 AMI is resolved from SSM."
  type        = string
  default     = null
}

variable "root_volume_size_gb" {
  description = "Root volume size in GiB. Application images live here; data lives on dedicated volumes."
  type        = number
  default     = 30
}

variable "ssm_parameter_prefix" {
  description = "SSM parameter path prefix the instance may read (non-secret and SecureString values)."
  type        = string
  default     = "/phoeve/beta"
}

variable "ssm_kms_key_arn" {
  description = "KMS key used for SecureString parameters. Null uses the AWS managed key for SSM (alias/aws/ssm)."
  type        = string
  default     = null
}

variable "app_log_group_name" {
  description = "CloudWatch log group the instance may write application logs to."
  type        = string
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
