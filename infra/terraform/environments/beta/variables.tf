variable "project" {
  description = "Product name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "workload_permissions_boundary_arn" {
  type     = string
  nullable = false
}
variable "dlm_permissions_boundary_arn" {
  type    = string
  default = null
}

variable "environment" {
  description = "Deployment stage. This configuration is the closed Beta stage."
  type        = string
  default     = "beta"

  validation {
    condition     = var.environment == "beta"
    error_message = "This configuration only manages the beta environment. Create a separate root for any other stage."
  }
}

variable "region" {
  description = "AWS region. us-east-1 is the confirmed region for the Beta."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = var.region == "us-east-1"
    error_message = "us-east-1 is the confirmed region. Changing it requires a new decision, not a variable override."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the Beta VPC."
  type        = string
  default     = "10.60.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the single public subnet that hosts the Beta instance."
  type        = string
  default     = "10.60.1.0/24"
}

variable "hosted_zone_id" {
  description = "Existing Route 53 hosted zone for the apex domain. The zone itself is never created here."
  type        = string
}

variable "record_name" {
  description = "Subdomain the Beta is published on."
  type        = string
  default     = "beta"
  validation {
    condition     = var.record_name == "beta"
    error_message = "The delegated role only manages beta.phoeve.com."
  }
}

variable "domain" {
  description = "Apex domain that owns the hosted zone."
  type        = string
  default     = "phoeve.com"
  validation {
    condition     = var.domain == "phoeve.com"
    error_message = "The approved zone domain is phoeve.com."
  }
}

variable "instance_type" {
  description = "Instance class for the Beta host. Confirm the exact class before applying."
  type        = string
  default     = "t4g.medium"
}

variable "root_volume_size_gb" {
  description = "Root volume size in GiB. Images and container logs live here."
  type        = number
  default     = 30
}

variable "ami_id" {
  description = "Pin the same approved AMI ID authorized by bootstrap. Automatic latest-image discovery is not allowed for delegated apply."
  type        = string
  nullable    = false
  validation {
    condition     = can(regex("^ami-[a-f0-9]{8}([a-f0-9]{9})?$", var.ami_id))
    error_message = "Supply the exact AMI ID reviewed in bootstrap."
  }
}

variable "db_volume_size_gb" {
  description = "PostgreSQL data volume size in GiB."
  type        = number
  default     = 30
}

variable "media_volume_size_gb" {
  description = "Media volume size in GiB. It is prepared but unused while the media provider stays unapproved."
  type        = number
  default     = 40
}

variable "enable_authority_volume" {
  description = "Create the dedicated RecoveryAuthority volume. Requires authority_gate_acknowledged."
  type        = bool
  default     = false
}

variable "authority_gate_acknowledged" {
  description = <<-EOT
    Confirms that the RecoveryAuthority gate has actually been decided:
    provider, reconstruction, and external anchor. Nothing else may set
    enable_authority_volume to true.
  EOT
  type        = bool
  default     = false
}

variable "authority_volume_size_gb" {
  description = "RecoveryAuthority volume size in GiB."
  type        = number
  default     = 8
}

variable "enable_ebs_snapshot_policy" {
  description = "Create the complementary daily EBS snapshot policy for the operational volumes."
  type        = bool
  default     = false
}

variable "acknowledge_complementary_backups" {
  description = "Confirms that EBS snapshots are complementary and are not the approved recovery path."
  type        = bool
  default     = false
}

variable "alert_emails" {
  description = "Addresses subscribed to the alert topic. Each subscription needs manual confirmation."
  type        = list(string)
  default     = []
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget for the Beta account scope."
  type        = number
  default     = 60
}

variable "ssm_parameter_prefix" {
  description = "SSM parameter path prefix the host may read."
  type        = string
  default     = "/phoeve/beta"
}

variable "ssm_kms_key_arn" {
  description = "KMS key for SecureString parameters. Null uses the AWS managed key (alias/aws/ssm)."
  type        = string
  default     = null
}

variable "app_log_group_name" {
  description = "CloudWatch log group for application logs."
  type        = string
  default     = "/phoeve/beta/application"
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for key in keys(var.tags) : !contains(["project", "environment", "datarole", "snapshotpolicy", "snapshotcreator", "datavolume"], lower(key))])
    error_message = "Ownership and data-classification tags, including case variants, are reserved to the modules."
  }
}
