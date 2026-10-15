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
  github_repository                 = "test-owner/EventLens"
  github_environment                = "beta"
  github_oidc_provider_arn          = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  hcp_organization                  = "test-team"
  hcp_project                       = "test-project"
  hcp_workspace                     = "phoeve-beta"
  hcp_oidc_provider_arn             = "arn:aws:iam::123456789012:oidc-provider/app.terraform.io"
  permissions_boundary_arn          = "arn:aws:iam::123456789012:policy/phoeve-beta-control-boundary"
  workload_permissions_boundary_arn = "arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"
  hosted_zone_id                    = "ZTESTBETA"
  allowed_ami_id                    = "ami-0123456789abcdef0"
}

override_data {
  target = module.identity.data.aws_iam_policy.control_boundary
  values = {
    arn    = "arn:aws:iam::123456789012:policy/phoeve-beta-control-boundary"
    policy = <<-JSON
{"Statement":[{"Action":["iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:TagRole","iam:UntagRole","iam:UpdateAssumeRolePolicy","iam:ListRolePolicies","iam:ListAttachedRolePolicies","iam:AttachRolePolicy","iam:DetachRolePolicy","iam:CreateInstanceProfile","iam:DeleteInstanceProfile","iam:GetInstanceProfile","iam:AddRoleToInstanceProfile","iam:RemoveRoleFromInstanceProfile","iam:TagInstanceProfile","iam:CreatePolicy","iam:DeletePolicy","iam:GetPolicy","iam:CreatePolicyVersion","iam:DeletePolicyVersion","iam:SetDefaultPolicyVersion","iam:ListPolicyVersions","iam:TagPolicy","iam:UntagPolicy","iam:PassRole","route53:ChangeResourceRecordSets","route53:GetChange","ssm:PutParameter","ssm:DeleteParameter","ssm:AddTagsToResource","ec2:AllocateAddress","ec2:CreateInternetGateway","ec2:CreateRouteTable","ec2:CreateSecurityGroup","ec2:CreateSubnet","ec2:CreateVolume","ec2:CreateVpc","ec2:AssociateAddress","ec2:AssociateRouteTable","ec2:AttachInternetGateway","ec2:AttachVolume","ec2:AuthorizeSecurityGroupEgress","ec2:AuthorizeSecurityGroupIngress","ec2:CreateRoute","ec2:DeleteInternetGateway","ec2:DeleteRoute","ec2:DeleteRouteTable","ec2:DeleteSecurityGroup","ec2:DeleteSubnet","ec2:DeleteVolume","ec2:DeleteVpc","ec2:DetachInternetGateway","ec2:DetachVolume","ec2:DisassociateAddress","ec2:DisassociateRouteTable","ec2:ModifyInstanceAttribute","ec2:ModifyInstanceMetadataOptions","ec2:ModifySubnetAttribute","ec2:ModifyVolume","ec2:ModifyVpcAttribute","ec2:ReleaseAddress","ec2:RevokeSecurityGroupEgress","ec2:RevokeSecurityGroupIngress","ec2:StartInstances","ec2:StopInstances","ec2:TerminateInstances","ec2:RunInstances","ec2:CreateTags","ec2:DeleteTags","logs:CreateLogGroup","logs:DeleteLogGroup","logs:PutRetentionPolicy","logs:TagLogGroup","logs:ListTagsLogGroup","logs:TagResource","cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms","cloudwatch:TagResource","cloudwatch:UntagResource","cloudwatch:ListTagsForResource","sns:CreateTopic","sns:DeleteTopic","sns:Subscribe","sns:Unsubscribe","sns:GetTopicAttributes","sns:SetTopicAttributes","sns:TagResource","sns:ListTagsForResource","dlm:CreateLifecyclePolicy","dlm:DeleteLifecyclePolicy","dlm:GetLifecyclePolicy","dlm:UpdateLifecyclePolicy","dlm:TagResource","budgets:ModifyBudget","budgets:ViewBudget","ec2:Describe*","ssm:GetParameter","ssm:GetParameters","ssm:DescribeParameters","iam:GetPolicyVersion","iam:ListInstanceProfilesForRole","logs:DescribeLogGroups","route53:GetHostedZone","route53:ListResourceRecordSets","tag:GetResources","sts:GetCallerIdentity","ssm:SendCommand","ssm:GetCommandInvocation","ssm:ListCommandInvocations","ssm:ListCommands"],"Effect":"Allow","Resource":"*"},{"Action":["iam:CreateRole","iam:DeleteRole","iam:TagRole","iam:UntagRole","iam:UpdateAssumeRolePolicy","iam:AttachRolePolicy","iam:DetachRolePolicy","iam:CreateInstanceProfile","iam:DeleteInstanceProfile","iam:AddRoleToInstanceProfile","iam:RemoveRoleFromInstanceProfile","iam:TagInstanceProfile","iam:CreatePolicy","iam:DeletePolicy","iam:CreatePolicyVersion","iam:DeletePolicyVersion","iam:SetDefaultPolicyVersion","iam:TagPolicy","iam:UntagPolicy","iam:PassRole"],"Effect":"Deny","NotResource":["arn:aws:iam::123456789012:role/phoeve-beta-instance","arn:aws:iam::123456789012:instance-profile/phoeve-beta-instance","arn:aws:iam::123456789012:policy/phoeve-beta-instance-runtime"],"Sid":"ProtectAllNonWorkloadIdentity"},{"Action":["iam:PutRolePermissionsBoundary","iam:DeleteRolePermissionsBoundary"],"Effect":"Deny","Resource":"*","Sid":"NeverRemoveOrReplaceBoundaries"},{"Action":["iam:CreateRole"],"Condition":{"StringNotEquals":{"iam:PermissionsBoundary":"arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"}},"Effect":"Deny","Resource":"arn:aws:iam::123456789012:role/phoeve-beta-instance"},{"Action":["iam:AttachRolePolicy","iam:DetachRolePolicy"],"Condition":{"ArnNotEquals":{"iam:PolicyARN":["arn:aws:iam::123456789012:policy/phoeve-beta-instance-runtime","arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"]}},"Effect":"Deny","Resource":"arn:aws:iam::123456789012:role/phoeve-beta-instance"},{"Action":["iam:PassRole"],"Condition":{"StringNotEquals":{"iam:PassedToService":"ec2.amazonaws.com"}},"Effect":"Deny","Resource":"arn:aws:iam::123456789012:role/phoeve-beta-instance"},{"Action":["route53:ChangeResourceRecordSets"],"Effect":"Deny","NotResource":"arn:aws:route53:::hostedzone/ZTESTBETA"},{"Action":["route53:ChangeResourceRecordSets"],"Condition":{"ForAnyValue:StringNotEquals":{"route53:ChangeResourceRecordSetsNormalizedRecordNames":["beta.phoeve.com"]}},"Effect":"Deny","Resource":"*"},{"Action":["route53:ChangeResourceRecordSets"],"Condition":{"ForAnyValue:StringNotEquals":{"route53:ChangeResourceRecordSetsRecordTypes":["A"]}},"Effect":"Deny","Resource":"*"},{"Action":["ssm:PutParameter","ssm:DeleteParameter","ssm:AddTagsToResource","ssm:GetParameter","ssm:GetParameters"],"Effect":"Deny","NotResource":["arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta","arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta/*"]},{"Action":["ec2:*"],"Condition":{"StringNotEquals":{"ec2:Region":"us-east-1"}},"Effect":"Deny","Resource":"*"}],"Version":"2012-10-17"}
JSON
  }
}
override_data {
  target = module.identity.data.aws_iam_policy.workload_boundary
  values = {
    arn    = "arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"
    policy = <<-JSON
{"Statement":[{"Action":["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],"Effect":"Allow","Resource":["arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta","arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta/*"]},{"Action":["logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams"],"Effect":"Allow","Resource":"arn:aws:logs:us-east-1:123456789012:log-group:/phoeve/beta/application:*"},{"Action":["ssm:DescribeAssociation","ssm:GetDeployablePatchSnapshotForInstance","ssm:GetDocument","ssm:DescribeDocument","ssm:GetManifest","ssm:ListAssociations","ssm:ListInstanceAssociations","ssm:PutInventory","ssm:PutComplianceItems","ssm:PutConfigurePackageResult","ssm:UpdateAssociationStatus","ssm:UpdateInstanceAssociationStatus","ssm:UpdateInstanceInformation","ssmmessages:CreateControlChannel","ssmmessages:CreateDataChannel","ssmmessages:OpenControlChannel","ssmmessages:OpenDataChannel","ec2messages:AcknowledgeMessage","ec2messages:DeleteMessage","ec2messages:FailMessage","ec2messages:GetEndpoint","ec2messages:GetMessages","ec2messages:SendReply"],"Effect":"Allow","Resource":"*"},{"Action":["kms:Decrypt"],"Condition":{"StringEquals":{"kms:ViaService":"ssm.us-east-1.amazonaws.com"},"StringLike":{"kms:EncryptionContext:PARAMETER_ARN":["arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta","arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta/*"]}},"Effect":"Allow","Resource":"*"}],"Version":"2012-10-17"}
JSON
  }
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

run "reject_control_boundary_absent" {
  command = plan
  variables {
    permissions_boundary_arn = ""
  }
  expect_failures = [var.permissions_boundary_arn]
}

run "reject_workload_boundary_absent" {
  command = plan
  variables {
    workload_permissions_boundary_arn = ""
  }
  expect_failures = [var.workload_permissions_boundary_arn]
}
