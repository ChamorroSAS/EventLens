data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

module "beta_permissions" {
  source               = "../beta-permissions"
  account_id           = data.aws_caller_identity.current.account_id
  region               = data.aws_region.current.name
  project              = var.project
  environment          = var.environment
  hosted_zone_id       = var.hosted_zone_id
  allowed_ami_id       = var.allowed_ami_id
  ssm_parameter_prefix = var.ssm_parameter_prefix
}

data "aws_iam_policy" "control_boundary" {
  arn = var.permissions_boundary_arn
  lifecycle {
    postcondition {
      condition     = self.arn == module.beta_permissions.boundary_arns.control && jsondecode(self.policy) == jsondecode(module.beta_permissions.control_boundary)
      error_message = "The externally bootstrapped control boundary must match the reviewed policy definition exactly."
    }
  }
}

data "aws_iam_policy" "workload_boundary" {
  arn = var.workload_permissions_boundary_arn
  lifecycle {
    postcondition {
      condition     = self.arn == module.beta_permissions.boundary_arns.workload && jsondecode(self.policy) == jsondecode(module.beta_permissions.workload_boundary)
      error_message = "The externally bootstrapped workload boundary must match the reviewed policy definition exactly."
    }
  }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  hcp_enabled = var.hcp_organization != "" && var.hcp_workspace != ""

  # GitHub's OIDC provider is validated against GitHub's CA; the thumbprint list
  # is still required by the API but is no longer used for validation.
  github_thumbprints = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  hcp_subject_base = join(":", compact([
    "organization:${var.hcp_organization}",
    var.hcp_project != "" ? "project:${var.hcp_project}" : "",
    "workspace:${var.hcp_workspace}"
  ]))
}

# --- GitHub Actions: deployment only --------------------------------------
# GitHub never receives AWS keys: it exchanges an OIDC token for a short-lived
# session, and the subject is bound to the protected GitHub environment.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = local.github_thumbprints

  tags = local.tags
}

locals {
  github_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : var.github_oidc_provider_arn
  )
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${var.project}-${var.environment}-github-deploy"
  description          = "Assumed by GitHub Actions to request a deployment over SSM."
  permissions_boundary = data.aws_iam_policy.control_boundary.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
        }
      }
    }]
  })

  tags = local.tags
}

# The deploy role can only ask the tagged Beta host to run the fixed deployment
# entry point, and only through the document created below. It cannot create,
# modify or delete infrastructure, and it cannot choose what the host runs: the
# document, not the caller, owns the script.
#
# A dedicated document replaces the AWS-managed AWS-RunShellScript: the caller
# supplies a validated action and (only for a deployment) a digest-pinned image
# pair, and SSM refuses anything that is not covered by allowedValues or
# allowedPattern before the host is contacted.
resource "aws_ssm_document" "deploy" {
  name            = "${var.project}-${var.environment}-deploy"
  document_type   = "Command"
  document_format = "JSON"
  content         = file("${path.module}/templates/deploy-command.json")

  tags = local.tags
}

resource "aws_iam_policy" "github_deploy" {
  name        = "${var.project}-${var.environment}-github-deploy"
  description = "Run the fixed deployment entry point on the tagged ${var.environment} host."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "FindTheBetaHost"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
      },
      {
        # Only this document, and therefore only the fixed entry point. No
        # AWS-managed document, and no wildcard, is reachable from this role.
        Sid      = "InvokeOnlyTheDeployDocument"
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = [aws_ssm_document.deploy.arn]
      },
      {
        Sid      = "TargetOnlyTheBetaHost"
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/Project"     = var.project
            "aws:ResourceTag/Environment" = var.environment
          }
        }
      },
      {
        Sid    = "ReadCommandResult"
        Effect = "Allow"
        Action = [
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
          "ssm:ListCommands"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = aws_iam_policy.github_deploy.arn
}

# --- HCP Terraform: plan and apply ----------------------------------------
# Two separate roles so that a plan run can never write. Both are assumed by HCP
# through its own OIDC issuer (dynamic provider credentials); no static AWS keys
# are stored in the workspace.

resource "aws_iam_openid_connect_provider" "hcp" {
  count = var.create_hcp_oidc_provider ? 1 : 0

  url            = "https://app.terraform.io"
  client_id_list = ["aws.workload.identity"]

  tags = local.tags
}

locals {
  hcp_provider_arn = (
    var.create_hcp_oidc_provider
    ? aws_iam_openid_connect_provider.hcp[0].arn
    : var.hcp_oidc_provider_arn
  )
}

resource "aws_iam_role" "hcp_plan" {
  count = local.hcp_enabled ? 1 : 0

  name                 = "${var.project}-${var.environment}-terraform-plan"
  description          = "Read-only role for HCP Terraform plan runs."
  permissions_boundary = data.aws_iam_policy.control_boundary.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.hcp_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "app.terraform.io:aud" = "aws.workload.identity"
          "app.terraform.io:sub" = "${local.hcp_subject_base}:run_phase:plan"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role" "hcp_apply" {
  count = local.hcp_enabled ? 1 : 0

  name                 = "${var.project}-${var.environment}-terraform-apply"
  description          = "Role used by HCP Terraform apply runs. Auto-apply stays disabled."
  permissions_boundary = data.aws_iam_policy.control_boundary.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.hcp_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "app.terraform.io:aud" = "aws.workload.identity"
          "app.terraform.io:sub" = "${local.hcp_subject_base}:run_phase:apply"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_policy" "hcp_plan" {
  name        = "${var.project}-${var.environment}-terraform-plan"
  description = "Read-only discovery actions required to plan the ${var.environment} stack."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadOnlyDiscovery"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:DescribeParameters",
          "iam:GetRole",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:GetInstanceProfile",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "logs:DescribeLogGroups",
          "route53:GetHostedZone",
          "route53:ListResourceRecordSets",
          "sns:GetTopicAttributes",
          "sns:ListTagsForResource",
          "cloudwatch:DescribeAlarms",
          "budgets:ViewBudget",
          "tag:GetResources",
          "sts:GetCallerIdentity"
        ]
        Resource = "*"
      }
    ]
  })
}

# Apply permissions are intentionally listed service by service so that a review
# can see exactly what the Beta stack is allowed to create. Anything not listed
# here is expected to fail loudly rather than be granted silently.
resource "aws_iam_policy" "hcp_apply" {
  count       = local.hcp_enabled ? 1 : 0
  name        = "${var.project}-${var.environment}-terraform-apply"
  description = "Scoped IAM, DNS and parameter management for Beta."
  policy      = module.beta_permissions.apply_policies.core
  lifecycle {
    precondition {
      condition     = length(module.beta_permissions.apply_policies.core) <= 6144 && length(module.beta_permissions.apply_policies) <= 10 && data.aws_iam_policy.workload_boundary.arn == module.beta_permissions.boundary_arns.workload
      error_message = "The apply role must fit IAM document and attachment quotas."
    }
  }
}

resource "aws_iam_policy" "hcp_apply_scoped" {
  for_each = local.hcp_enabled ? { for name, policy in module.beta_permissions.apply_policies : name => policy if name != "core" } : {}
  name     = "${var.project}-${var.environment}-terraform-apply-${each.key}"
  policy   = each.value
  lifecycle {
    precondition {
      condition     = length(each.value) <= 6144
      error_message = "A scoped policy exceeds IAM's 6,144-character limit."
    }
  }
}

resource "aws_iam_role_policy_attachment" "hcp_apply_scoped" {
  for_each   = aws_iam_policy.hcp_apply_scoped
  role       = aws_iam_role.hcp_apply[0].name
  policy_arn = each.value.arn
}

resource "aws_iam_role_policy_attachment" "hcp_plan" {
  count = local.hcp_enabled ? 1 : 0

  role       = aws_iam_role.hcp_plan[0].name
  policy_arn = aws_iam_policy.hcp_plan.arn
}

resource "aws_iam_role_policy_attachment" "hcp_apply" {
  count = local.hcp_enabled ? 1 : 0

  role       = aws_iam_role.hcp_apply[0].name
  policy_arn = aws_iam_policy.hcp_apply[0].arn
}
