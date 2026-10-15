# Account-level identity for the closed Beta.
#
# This root creates only the trust relationships and roles the publishing flow
# needs. It creates no workload infrastructure, so it can be reviewed and applied
# before, and independently of, the Beta workspace.

resource "terraform_data" "guard_rails" {
  lifecycle {
    precondition {
      condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
      error_message = "github_repository must be in owner/name form so the OIDC subject cannot be widened with a wildcard."
    }

    precondition {
      condition = (
        var.create_github_oidc_provider ? var.github_oidc_provider_arn == null : var.github_oidc_provider_arn != null
      )
      error_message = "Set exactly one of create_github_oidc_provider or github_oidc_provider_arn."
    }

    precondition {
      condition = (
        var.hcp_organization == "" ? true : var.hcp_workspace != ""
      )
      error_message = "hcp_workspace is required when hcp_organization is set."
    }
  }
}

module "identity" {
  # Keep the input-only preconditions and variable validations independent of
  # resource creation. Variable validations also protect targeted module plans.
  # A module-wide depends_on defers its account/region reads until apply.
  source = "../../modules/identity"

  project                           = var.project
  environment                       = var.environment
  github_repository                 = var.github_repository
  github_environment                = var.github_environment
  create_github_oidc_provider       = var.create_github_oidc_provider
  github_oidc_provider_arn          = var.github_oidc_provider_arn
  hcp_organization                  = var.hcp_organization
  hcp_project                       = var.hcp_project
  hcp_workspace                     = var.hcp_workspace
  create_hcp_oidc_provider          = var.create_hcp_oidc_provider
  hcp_oidc_provider_arn             = var.hcp_oidc_provider_arn
  permissions_boundary_arn          = var.permissions_boundary_arn
  workload_permissions_boundary_arn = var.workload_permissions_boundary_arn
  hosted_zone_id                    = var.hosted_zone_id
  allowed_ami_id                    = var.allowed_ami_id
  ssm_parameter_prefix              = var.ssm_parameter_prefix
  tags                              = var.tags
}
