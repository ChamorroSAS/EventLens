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
  # Bootstrap runs in its own workspace and creates the account-level identity
  # the Beta workspace depends on. The cloud block is not committed; copy
  # backend.hcp.tf.tpl and fill in the organisation and workspace.
  #
  # Never apply with local state.
}

provider "aws" {
  region = var.region
}
