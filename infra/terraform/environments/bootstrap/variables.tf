variable "project" {
  description = "Product name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage the created roles are named for."
  type        = string
  default     = "beta"
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

variable "github_repository" {
  description = "GitHub repository allowed to assume the deployment role, in owner/name form."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must be in owner/name form so the OIDC subject cannot be widened with a wildcard."
  }
}

variable "github_environment" {
  description = "Protected GitHub environment that must appear in the OIDC subject."
  type        = string
  default     = "beta"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider in this account. Set to false when one already exists."
  type        = bool
  default     = false

  validation {
    condition     = var.create_github_oidc_provider ? var.github_oidc_provider_arn == null : var.github_oidc_provider_arn != null
    error_message = "Set exactly one of create_github_oidc_provider or github_oidc_provider_arn."
  }
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN, required when create_github_oidc_provider is false."
  type        = string
  default     = null
}

variable "hcp_organization" {
  description = "HCP Terraform organization. Empty keeps the HCP roles uncreated."
  type        = string
  default     = ""

  validation {
    condition     = var.hcp_organization == "" ? true : var.hcp_workspace != ""
    error_message = "hcp_workspace is required when hcp_organization is set."
  }
}

variable "hcp_project" {
  description = "HCP Terraform project name."
  type        = string
  default     = ""
}

variable "hcp_workspace" {
  description = "HCP Terraform workspace that runs the Beta plan and apply."
  type        = string
  default     = ""
}

variable "create_hcp_oidc_provider" {
  description = "Create the HCP Terraform OIDC provider in this account."
  type        = bool
  default     = false
}

variable "hcp_oidc_provider_arn" {
  description = "Existing HCP Terraform OIDC provider ARN."
  type        = string
  default     = null
}

variable "permissions_boundary_arn" {
  description = "Optional permissions boundary attached to every role created here."
  type        = string
  default     = null
}

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
