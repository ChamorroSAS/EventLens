# Pure policy compiler: no providers, data sources, credentials or resources.
# The external boundary root and bootstrap consume the same definitions.
locals {
  name           = "${var.project}-${var.environment}"
  iam            = "arn:aws:iam::${var.account_id}"
  ec2            = "arn:aws:ec2:${var.region}:${var.account_id}"
  role           = "${local.iam}:role/${local.name}-instance"
  profile        = "${local.iam}:instance-profile/${local.name}-instance"
  runtime_policy = "${local.iam}:policy/${local.name}-instance-runtime"
  control_bound  = "${local.iam}:policy/${local.name}-control-boundary"
  workload_bound = "${local.iam}:policy/${local.name}-workload-boundary"
  dlm_bound      = "${local.iam}:policy/${local.name}-dlm-boundary"
  parameter      = "arn:aws:ssm:${var.region}:${var.account_id}:parameter${var.ssm_parameter_prefix}"
  owned          = { "aws:ResourceTag/Project" = var.project, "aws:ResourceTag/Environment" = var.environment }
  requested      = { "aws:RequestTag/Project" = var.project, "aws:RequestTag/Environment" = var.environment }
  ec2_owned      = merge(local.owned, { "ec2:Region" = var.region })
  ec2_requested  = merge(local.requested, { "ec2:Region" = var.region })
  ec2_types      = ["vpc", "subnet", "internet-gateway", "route-table", "security-group", "security-group-rule", "instance", "volume", "elastic-ip", "network-interface"]
  ec2_arns       = merge({ for t in local.ec2_types : t => "${local.ec2}:${t}/*" }, { snapshot = "arn:aws:ec2:${var.region}::snapshot/*" })
  core_statements = [
    {
      Sid       = "CreateBoundedInstanceRole", Effect = "Allow", Action = ["iam:CreateRole"], Resource = local.role
      Condition = { StringEquals = merge(local.requested, { "iam:PermissionsBoundary" = local.workload_bound }) }
    },
    {
      Sid      = "ManageOnlyInstanceRole", Effect = "Allow"
      Action   = ["iam:DeleteRole", "iam:GetRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"]
      Resource = local.role
    },
    {
      Sid       = "AttachOnlyRuntimePolicies", Effect = "Allow", Action = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"], Resource = local.role
      Condition = { ArnEquals = { "iam:PolicyARN" = [local.runtime_policy, "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"] } }
    },
    {
      Sid      = "ManageOnlyInstanceProfile", Effect = "Allow"
      Action   = ["iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile"]
      Resource = local.profile
    },
    {
      Sid      = "ManagePolicyObjects", Effect = "Allow"
      Action   = ["iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:ListPolicyVersions", "iam:TagPolicy", "iam:UntagPolicy"]
      Resource = local.runtime_policy
    },
    {
      Sid       = "PassInstanceRoleToEc2Only", Effect = "Allow", Action = ["iam:PassRole"], Resource = local.role
      Condition = { StringEquals = { "iam:PassedToService" = "ec2.amazonaws.com" } }
    },
    {
      Sid = "ManageOnlyBetaRecord", Effect = "Allow", Action = ["route53:ChangeResourceRecordSets"], Resource = "arn:aws:route53:::hostedzone/${var.hosted_zone_id}"
      Condition = {
        "ForAllValues:StringEquals" = {
          "route53:ChangeResourceRecordSetsNormalizedRecordNames" = ["beta.phoeve.com"]
          "route53:ChangeResourceRecordSetsRecordTypes"           = ["A"]
          "route53:ChangeResourceRecordSetsActions"               = ["CREATE", "UPSERT", "DELETE"]
        }
        Null = {
          "route53:ChangeResourceRecordSetsNormalizedRecordNames" = "false"
          "route53:ChangeResourceRecordSetsRecordTypes"           = "false"
          "route53:ChangeResourceRecordSetsActions"               = "false"
        }
      }
    },
    { Sid = "ReadChangeStatus", Effect = "Allow", Action = ["route53:GetChange"], Resource = "arn:aws:route53:::change/*" },
    {
      Sid      = "ManageSsmParameters", Effect = "Allow", Action = ["ssm:PutParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource"]
      Resource = [local.parameter, "${local.parameter}/*"]
    }
  ]

  # New resource tags cannot be used to authorize existing parent resources.
  ec2_create = {
    CreateVpc             = { new = ["vpc"], parent = [] }
    CreateSubnet          = { new = ["subnet"], parent = ["vpc"] }
    CreateInternetGateway = { new = ["internet-gateway"], parent = [] }
    CreateRouteTable      = { new = ["route-table"], parent = ["vpc"] }
    CreateSecurityGroup   = { new = ["security-group"], parent = ["vpc"] }
    AllocateAddress       = { new = ["elastic-ip"], parent = [] }
    CreateVolume          = { new = ["volume"], parent = [] }
  }
  ec2_existing = {
    DeleteVpc                     = ["vpc"]
    ModifyVpcAttribute            = ["vpc"]
    DeleteSubnet                  = ["subnet"]
    ModifySubnetAttribute         = ["subnet"]
    DeleteInternetGateway         = ["internet-gateway"]
    AttachInternetGateway         = ["internet-gateway", "vpc"]
    DetachInternetGateway         = ["internet-gateway", "vpc"]
    DeleteRouteTable              = ["route-table"]
    CreateRoute                   = ["route-table"]
    DeleteRoute                   = ["route-table"]
    AssociateRouteTable           = ["route-table", "subnet"]
    DisassociateRouteTable        = ["route-table", "subnet"]
    DeleteSecurityGroup           = ["security-group"]
    AuthorizeSecurityGroupIngress = ["security-group"]
    RevokeSecurityGroupIngress    = ["security-group"]
    AuthorizeSecurityGroupEgress  = ["security-group"]
    RevokeSecurityGroupEgress     = ["security-group"]
    TerminateInstances            = ["instance"]
    StartInstances                = ["instance"]
    StopInstances                 = ["instance"]
    ModifyInstanceAttribute       = ["instance"]
    ModifyInstanceMetadataOptions = ["instance"]
    DeleteVolume                  = ["volume"]
    AttachVolume                  = ["volume", "instance"]
    DetachVolume                  = ["volume", "instance"]
    ModifyVolume                  = ["volume"]
    ReleaseAddress                = ["elastic-ip"]
    AssociateAddress              = ["elastic-ip", "instance"]
    DisassociateAddress           = ["elastic-ip"]
  }
  ec2_statements = concat(
    flatten([for action, spec in local.ec2_create : concat([
      {
        Effect = "Allow", Action = ["ec2:${action}"], Resource = [for t in spec.new : local.ec2_arns[t]]
        Condition = merge(
          { StringEquals = merge(local.ec2_requested, { for key, value in { "ec2:VolumeType" = "gp3" } : key => value if action == "CreateVolume" }) },
          { for key, value in { Bool = { "ec2:Encrypted" = "true" } } : key => value if action == "CreateVolume" }
        )
      }
      ], length(spec.parent) == 0 ? [] : [{
        Effect    = "Allow", Action = ["ec2:${action}"], Resource = [for t in spec.parent : local.ec2_arns[t]]
        Condition = { StringEquals = local.ec2_owned }
    }])]),
    [for action, types in local.ec2_existing : {
      Effect    = "Allow", Action = ["ec2:${action}"], Resource = [for t in types : local.ec2_arns[t]]
      Condition = { StringEquals = local.ec2_owned }
    }],
    [
      {
        Sid      = "LaunchPinnedAmi", Effect = "Allow", Action = ["ec2:RunInstances"]
        Resource = "arn:aws:ec2:${var.region}::image/${var.allowed_ami_id}", Condition = { StringEquals = { "ec2:Region" = var.region } }
      },
      {
        Sid       = "LaunchTaggedInstance", Effect = "Allow", Action = ["ec2:RunInstances"], Resource = local.ec2_arns.instance
        Condition = { StringEquals = merge(local.ec2_requested, { "ec2:InstanceType" = "t4g.medium", "ec2:MetadataHttpTokens" = "required", "ec2:InstanceProfile" = local.profile }) }
      },
      {
        Sid       = "LaunchTaggedEncryptedVolume", Effect = "Allow", Action = ["ec2:RunInstances"], Resource = local.ec2_arns.volume
        Condition = { StringEquals = merge(local.ec2_requested, { "ec2:VolumeType" = "gp3" }), Bool = { "ec2:Encrypted" = "true" } }
      },
      {
        Sid       = "LaunchInOwnedNetwork", Effect = "Allow", Action = ["ec2:RunInstances"], Resource = [local.ec2_arns.subnet, local.ec2_arns["security-group"]]
        Condition = { StringEquals = local.ec2_owned }
      },
      {
        # RunInstances creates the primary ENI without Terraform tag specs.
        # Its existing subnet and SG must independently pass ownership checks.
        Sid       = "LaunchPrimaryInterface", Effect = "Allow", Action = ["ec2:RunInstances"], Resource = local.ec2_arns["network-interface"]
        Condition = { StringEquals = { "ec2:Region" = var.region }, ArnLike = { "ec2:Subnet" = local.ec2_arns.subnet } }
      },
      {
        Sid       = "TagDuringCreation", Effect = "Allow", Action = ["ec2:CreateTags"], Resource = values(local.ec2_arns)
        Condition = { StringEquals = merge(local.ec2_requested, { "ec2:CreateAction" = concat(keys(local.ec2_create), ["RunInstances"]) }) }
      },
      {
        Sid       = "RetagOwnedResources", Effect = "Allow", Action = ["ec2:CreateTags", "ec2:DeleteTags"], Resource = values(local.ec2_arns)
        Condition = { StringEquals = local.ec2_owned }
      },
      {
        Sid       = "NeverRetagOwnership", Effect = "Deny", Action = ["ec2:CreateTags"], Resource = values(local.ec2_arns)
        Condition = { "ForAnyValue:StringEqualsIgnoreCase" = { "aws:TagKeys" = ["Project", "Environment", "DataRole"] }, Null = { "ec2:CreateAction" = "true" } }
      },
      {
        Sid       = "NeverDeleteOwnership", Effect = "Deny", Action = ["ec2:DeleteTags"], Resource = values(local.ec2_arns)
        Condition = { "ForAnyValue:StringEqualsIgnoreCase" = { "aws:TagKeys" = ["Project", "Environment", "DataRole"] } }
      }
  ])

  service_statements = [
    {
      Sid      = "ManageApplicationLogs", Effect = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:TagLogGroup", "logs:ListTagsLogGroup", "logs:TagResource"]
      Resource = ["arn:aws:logs:${var.region}:${var.account_id}:log-group:/phoeve/beta/application", "arn:aws:logs:${var.region}:${var.account_id}:log-group:/phoeve/beta/application:*"]
    },
    {
      Sid      = "ManageBetaAlarms", Effect = "Allow"
      Action   = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:DescribeAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource"]
      Resource = [for alarm in ["instance-status", "cpu-high"] : "arn:aws:cloudwatch:${var.region}:${var.account_id}:alarm:${local.name}-${alarm}"]
    },
    {
      Sid      = "ManageBetaAlerts", Effect = "Allow"
      Action   = ["sns:CreateTopic", "sns:DeleteTopic", "sns:Subscribe", "sns:Unsubscribe", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:TagResource", "sns:ListTagsForResource"]
      Resource = "arn:aws:sns:${var.region}:${var.account_id}:${local.name}-alerts"
    },
    {
      Sid       = "CreateTaggedDlmPolicy", Effect = "Allow", Action = ["dlm:CreateLifecyclePolicy"], Resource = "*"
      Condition = { StringEquals = merge(local.requested, { "aws:RequestedRegion" = var.region }) }
    },
    {
      Sid      = "ManageOwnedDlmPolicy", Effect = "Allow", Action = ["dlm:DeleteLifecyclePolicy", "dlm:GetLifecyclePolicy", "dlm:UpdateLifecyclePolicy", "dlm:TagResource"]
      Resource = "arn:aws:dlm:${var.region}:${var.account_id}:policy/*", Condition = { StringEquals = local.owned }
    },
    {
      Sid      = "ManageBetaBudget", Effect = "Allow", Action = ["budgets:ModifyBudget", "budgets:ViewBudget"]
      Resource = "arn:aws:budgets::${var.account_id}:budget/${local.name}-monthly"
    }
  ]

  # Chunk by statements to remain below the IAM 6,144-character policy limit.
  apply_statements = merge({ core = local.core_statements, services = local.service_statements }, {
    for index in range(ceil(length(local.ec2_statements) / 8)) : "ec2-${index}" => slice(local.ec2_statements, index * 8, min((index + 1) * 8, length(local.ec2_statements)))
  })
  apply_policies = { for name, statements in local.apply_statements : name => jsonencode({ Version = "2012-10-17", Statement = statements }) }

  # A boundary limits; it does NOT grant. Identity policies retain all resource
  # restrictions above. The control ceiling cannot mutate its own protections.
  control_boundary = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow", Action = distinct(concat(flatten([for statements in values(local.apply_statements) : flatten([for s in statements : s.Action])]), [
          "ec2:Describe*", "ssm:GetParameter", "ssm:GetParameters", "ssm:DescribeParameters", "iam:GetRole", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:GetInstanceProfile", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "logs:DescribeLogGroups", "route53:GetHostedZone", "route53:ListResourceRecordSets", "sns:GetTopicAttributes", "sns:ListTagsForResource", "cloudwatch:DescribeAlarms", "budgets:ViewBudget", "tag:GetResources", "sts:GetCallerIdentity", "ssm:SendCommand", "ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands"
        ])), Resource = "*"
      },
      {
        Sid         = "ProtectAllNonWorkloadIdentity", Effect = "Deny"
        Action      = ["iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile", "iam:CreatePolicy", "iam:DeletePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:TagPolicy", "iam:UntagPolicy", "iam:PassRole"]
        NotResource = [local.role, local.profile, local.runtime_policy]
      },
      { Sid = "NeverRemoveOrReplaceBoundaries", Effect = "Deny", Action = ["iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary"], Resource = "*" },
      { Effect = "Deny", Action = ["iam:CreateRole"], Resource = local.role, Condition = { StringNotEquals = { "iam:PermissionsBoundary" = local.workload_bound } } },
      { Effect = "Deny", Action = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"], Resource = local.role, Condition = { ArnNotEquals = { "iam:PolicyARN" = [local.runtime_policy, "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"] } } },
      { Effect = "Deny", Action = ["iam:PassRole"], Resource = local.role, Condition = { StringNotEquals = { "iam:PassedToService" = "ec2.amazonaws.com" } } },
      { Effect = "Deny", Action = ["route53:ChangeResourceRecordSets"], NotResource = "arn:aws:route53:::hostedzone/${var.hosted_zone_id}" },
      { Effect = "Deny", Action = ["route53:ChangeResourceRecordSets"], Resource = "*", Condition = { "ForAnyValue:StringNotEquals" = { "route53:ChangeResourceRecordSetsNormalizedRecordNames" = ["beta.phoeve.com"] } } },
      { Effect = "Deny", Action = ["route53:ChangeResourceRecordSets"], Resource = "*", Condition = { "ForAnyValue:StringNotEquals" = { "route53:ChangeResourceRecordSetsRecordTypes" = ["A"] } } },
      { Effect = "Deny", Action = ["ssm:PutParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource", "ssm:GetParameter", "ssm:GetParameters"], NotResource = [local.parameter, "${local.parameter}/*"] },
      { Effect = "Deny", Action = ["ec2:*"], Resource = "*", Condition = { StringNotEquals = { "ec2:Region" = var.region } } }
    ]
  })

  workload_boundary = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"], Resource = [local.parameter, "${local.parameter}/*"] },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], Resource = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/phoeve/beta/application:*" },
      {
        Effect   = "Allow", Action = ["ssm:DescribeAssociation", "ssm:GetDeployablePatchSnapshotForInstance", "ssm:GetDocument", "ssm:DescribeDocument", "ssm:GetManifest", "ssm:ListAssociations", "ssm:ListInstanceAssociations", "ssm:PutInventory", "ssm:PutComplianceItems", "ssm:PutConfigurePackageResult", "ssm:UpdateAssociationStatus", "ssm:UpdateInstanceAssociationStatus", "ssm:UpdateInstanceInformation", "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel", "ec2messages:AcknowledgeMessage", "ec2messages:DeleteMessage", "ec2messages:FailMessage", "ec2messages:GetEndpoint", "ec2messages:GetMessages", "ec2messages:SendReply"]
        Resource = "*"
      },
      {
        Effect    = "Allow", Action = ["kms:Decrypt"], Resource = "*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" }, StringLike = { "kms:EncryptionContext:PARAMETER_ARN" = [local.parameter, "${local.parameter}/*"] } }
      }
    ]
  })
  dlm_boundary = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ec2:DescribeVolumes", "ec2:DescribeSnapshots"], Resource = "*", Condition = { StringEquals = { "ec2:Region" = var.region } } },
    { Effect = "Allow", Action = ["ec2:CreateSnapshot"], Resource = local.ec2_arns.volume, Condition = { StringEquals = merge(local.ec2_owned, { "aws:ResourceTag/SnapshotPolicy" = "daily", "aws:ResourceTag/DataRole" = ["database", "media"] }) } },
    { Effect = "Allow", Action = ["ec2:CreateSnapshot"], Resource = local.ec2_arns.snapshot, Condition = { StringEquals = merge(local.ec2_requested, { "aws:RequestTag/SnapshotCreator" = "dlm" }) } },
    { Effect = "Allow", Action = ["ec2:CreateTags"], Resource = local.ec2_arns.snapshot, Condition = { StringEquals = merge(local.ec2_requested, { "aws:RequestTag/SnapshotCreator" = "dlm", "ec2:CreateAction" = "CreateSnapshot" }) } },
    { Effect = "Allow", Action = ["ec2:DeleteSnapshot"], Resource = local.ec2_arns.snapshot, Condition = { StringEquals = merge(local.ec2_owned, { "aws:ResourceTag/SnapshotCreator" = "dlm", "aws:ResourceTag/DataRole" = ["database", "media"] }) } }
  ] })
}
