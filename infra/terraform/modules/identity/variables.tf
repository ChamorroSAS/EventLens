variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deployment role, in owner/name form."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment that must be present in the OIDC subject."
  type        = string
  default     = "beta"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set to false when the account already has one."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN. Required when create_github_oidc_provider is false."
  type        = string
  default     = null
}

variable "hcp_organization" {
  description = "HCP Terraform organization. Empty disables the HCP roles."
  type        = string
  default     = ""
}

variable "hcp_project" {
  description = "HCP Terraform project name."
  type        = string
  default     = ""
}

variable "hcp_workspace" {
  description = "HCP Terraform workspace name for the Beta workspace."
  type        = string
  default     = ""
}

variable "create_hcp_oidc_provider" {
  description = "Create the HCP Terraform OIDC provider. Set to false when the account already has one."
  type        = bool
  default     = false
}

variable "hcp_oidc_provider_arn" {
  description = "Existing HCP Terraform OIDC provider ARN."
  type        = string
  default     = null
}

variable "permissions_boundary_arn" {
  description = "Mandatory pre-existing control boundary, provisioned outside the delegated apply role."
  type        = string
  nullable    = false
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/phoeve-beta-control-boundary$", var.permissions_boundary_arn))
    error_message = "Supply the immutable Phoeve Beta control boundary ARN."
  }
}

variable "workload_permissions_boundary_arn" {
  type     = string
  nullable = false
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/phoeve-beta-workload-boundary$", var.workload_permissions_boundary_arn))
    error_message = "Supply the pre-existing workload boundary ARN."
  }
}
variable "hosted_zone_id" { type = string }
variable "allowed_ami_id" { type = string }

variable "ssm_parameter_prefix" {
  description = "SSM parameter path prefix the apply role may manage."
  type        = string
  default     = "/phoeve/beta"
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
