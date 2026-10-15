terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Remote state backend: HCP Terraform (candidate, pending authorisation).
  #
  # The block is intentionally absent from the repository so that no organisation
  # name is committed and so that static validation can run without a backend.
  # Before any plan or apply, the operator copies backend.hcp.tf.tpl into
  # backend.hcp.tf and fills in the organisation and workspace, or CI generates
  # that file from the same template.
  #
  # Never apply with local state: it would make the state an unmanaged secret
  # store and break the review trail.
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "EventLens"
    }
  }
}
