variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "An explicit AWS account ID is required."
  }
}
variable "region" {
  type    = string
  default = "us-east-1"
  validation {
    condition     = var.region == "us-east-1"
    error_message = "Only the approved Beta region is supported."
  }
}
variable "project" {
  type    = string
  default = "phoeve"
  validation {
    condition     = var.project == "phoeve"
    error_message = "This policy set is for Phoeve only."
  }
}
variable "environment" {
  type    = string
  default = "beta"
  validation {
    condition     = var.environment == "beta"
    error_message = "This policy set is for Beta only."
  }
}
variable "hosted_zone_id" {
  type = string
  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.hosted_zone_id))
    error_message = "Supply the authorized hosted zone ID without a path or wildcard."
  }
}
variable "allowed_ami_id" {
  type = string
  validation {
    condition     = can(regex("^ami-[a-f0-9]{8}([a-f0-9]{9})?$", var.allowed_ami_id))
    error_message = "Pin the approved AMI ID before planning bootstrap."
  }
}
variable "ssm_parameter_prefix" {
  type    = string
  default = "/phoeve/beta"
  validation {
    condition     = var.ssm_parameter_prefix == "/phoeve/beta"
    error_message = "The namespace is exactly /phoeve/beta, without a trailing slash or wildcard."
  }
}
