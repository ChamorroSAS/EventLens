# All runs are plan-only and the AWS provider is mocked. No AWS credentials,
# backend, or real resource operations are used by this suite.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:role/test-only"
      user_id    = "test-only"
    }
  }
  mock_data "aws_region" {
    defaults = {
      name = "us-east-1"
    }
  }
}

variables {
  github_repository        = "test-owner/EventLens"
  github_environment       = "beta"
  github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  hcp_organization         = "test-team"
  hcp_project              = "test-project"
  hcp_workspace            = "phoeve-beta"
  hcp_oidc_provider_arn    = "arn:aws:iam::123456789012:oidc-provider/app.terraform.io"
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/test-boundary"
}

run "policies_and_existing_oidc_resolve_in_plan" {
  command = plan

  assert {
    condition     = module.identity.github_oidc_provider_arn == var.github_oidc_provider_arn
    error_message = "The existing GitHub provider must remain the exact supplied ARN."
  }
  assert {
    condition     = module.identity.hcp_oidc_provider_arn == var.hcp_oidc_provider_arn
    error_message = "The existing HCP provider must remain the exact supplied ARN."
  }
}

run "new_oidc_providers" {
  command = plan
  variables {
    create_github_oidc_provider = true
    github_oidc_provider_arn    = null
    create_hcp_oidc_provider    = true
    hcp_oidc_provider_arn       = null
  }
}

run "reject_malformed_repository" {
  command = plan
  variables {
    github_repository = "missing-owner"
  }
  expect_failures = [var.github_repository]
}

run "reject_missing_github_provider" {
  command = plan
  variables {
    create_github_oidc_provider = false
    github_oidc_provider_arn    = null
  }
  expect_failures = [var.create_github_oidc_provider]
}

run "reject_duplicate_github_provider_selection" {
  command = plan
  variables {
    create_github_oidc_provider = true
  }
  expect_failures = [var.create_github_oidc_provider]
}

run "reject_hcp_organization_without_workspace" {
  command = plan
  variables {
    hcp_workspace = ""
  }
  expect_failures = [var.hcp_organization]
}

run "reject_unapproved_region" {
  command = plan
  variables {
    region = "eu-west-1"
  }
  expect_failures = [var.region]
}

# Targeting must not bypass the input checks even when guard_rails is pruned.
run "target_rejects_malformed_repository" {
  command = plan
  plan_options {
    target = [module.identity]
  }
  variables {
    github_repository = "missing-owner"
  }
  expect_failures = [var.github_repository]
}

run "target_rejects_missing_github_provider" {
  command = plan
  plan_options {
    target = [module.identity]
  }
  variables {
    github_oidc_provider_arn = null
  }
  expect_failures = [var.create_github_oidc_provider]
}

run "target_rejects_duplicate_github_provider_selection" {
  command = plan
  plan_options {
    target = [module.identity]
  }
  variables {
    create_github_oidc_provider = true
  }
  expect_failures = [var.create_github_oidc_provider]
}

run "target_rejects_hcp_organization_without_workspace" {
  command = plan
  plan_options {
    target = [module.identity]
  }
  variables {
    hcp_workspace = ""
  }
  expect_failures = [var.hcp_organization]
}
