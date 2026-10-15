data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

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
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
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
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.hcp_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "app.terraform.io:aud" = "aws.workload.identity"
        }
        StringLike = {
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
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.hcp_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "app.terraform.io:aud" = "aws.workload.identity"
        }
        StringLike = {
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
  count = local.hcp_enabled ? 1 : 0

  name        = "${var.project}-${var.environment}-terraform-apply"
  description = "Create and update the ${var.environment} stack resources."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageNetworking"
        Effect = "Allow"
        Action = [
          "ec2:CreateVpc", "ec2:DeleteVpc", "ec2:ModifyVpcAttribute",
          "ec2:CreateSubnet", "ec2:DeleteSubnet", "ec2:ModifySubnetAttribute",
          "ec2:CreateInternetGateway", "ec2:DeleteInternetGateway",
          "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
          "ec2:CreateRouteTable", "ec2:DeleteRouteTable",
          "ec2:CreateRoute", "ec2:DeleteRoute",
          "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable",
          "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupEgress",
          "ec2:CreateTags", "ec2:DeleteTags"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageComputeAndStorage"
        Effect = "Allow"
        Action = [
          "ec2:RunInstances", "ec2:TerminateInstances", "ec2:StartInstances",
          "ec2:StopInstances", "ec2:ModifyInstanceAttribute", "ec2:ModifyInstanceMetadataOptions",
          "ec2:CreateVolume", "ec2:DeleteVolume", "ec2:AttachVolume", "ec2:DetachVolume",
          "ec2:ModifyVolume", "ec2:CreateSnapshot", "ec2:DeleteSnapshot",
          "ec2:AllocateAddress", "ec2:ReleaseAddress", "ec2:AssociateAddress", "ec2:DisassociateAddress"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageInstanceIdentity"
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:TagRole",
          "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
          "iam:GetInstanceProfile", "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageInstanceRolePolicies"
        Effect = "Allow"
        Action = [
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:PutRolePolicy", "iam:DeleteRolePolicy"
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "iam:PolicyARN" = [
              "arn:aws:iam::${local.account_id}:policy/${var.project}-${var.environment}-*",
              "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
            ]
          }
        }
      },
      {
        Sid    = "ManagePolicyObjects"
        Effect = "Allow"
        Action = [
          "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy",
          "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion",
          "iam:ListPolicyVersions", "iam:TagPolicy", "iam:UntagPolicy"
        ]
        Resource = "arn:aws:iam::${local.account_id}:policy/${var.project}-${var.environment}-*"
      },
      {
        Sid      = "PassInstanceRoleToEc2Only"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${local.account_id}:role/${var.project}-${var.environment}-*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ec2.amazonaws.com"
          }
        }
      },
      {
        Sid    = "ManageObservability"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
          "logs:TagLogGroup", "logs:ListTagsLogGroup", "logs:TagResource",
          "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:DescribeAlarms",
          "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource",
          "sns:CreateTopic", "sns:DeleteTopic", "sns:Subscribe", "sns:Unsubscribe",
          "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:TagResource", "sns:ListTagsForResource"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManagePublishedRecord"
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:GetChange"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageSnapshotPolicy"
        Effect = "Allow"
        Action = [
          "dlm:CreateLifecyclePolicy", "dlm:DeleteLifecyclePolicy",
          "dlm:GetLifecyclePolicy", "dlm:UpdateLifecyclePolicy", "dlm:TagResource"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageCostBudget"
        Effect = "Allow"
        Action = [
          "budgets:CreateBudget", "budgets:DeleteBudget", "budgets:ModifyBudget",
          "budgets:ViewBudget"
        ]
        Resource = "*"
      },
      {
        Sid    = "ManageSsmParameters"
        Effect = "Allow"
        Action = [
          "ssm:PutParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource"
        ]
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.ssm_parameter_prefix}*"
      }
    ]
  })
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
