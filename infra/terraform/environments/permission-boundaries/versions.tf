terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
  # Use a separate authorized remote workspace; no local-state deployment.
}
provider "aws" { region = "us-east-1" }
