data "aws_caller_identity" "current" {}
module "permissions_contract" {
  source               = "../../modules/beta-permissions"
  account_id           = data.aws_caller_identity.current.account_id
  region               = var.region
  project              = var.project
  environment          = var.environment
  hosted_zone_id       = var.hosted_zone_id
  allowed_ami_id       = var.ami_id
  ssm_parameter_prefix = var.ssm_parameter_prefix
}
data "aws_iam_policy" "workload_boundary" {
  arn = var.workload_permissions_boundary_arn
  lifecycle {
    postcondition {
      condition     = self.arn == module.permissions_contract.boundary_arns.workload && jsondecode(self.policy) == jsondecode(module.permissions_contract.workload_boundary)
      error_message = "The runtime boundary must match the reviewed external policy."
    }
  }
}
data "aws_iam_policy" "dlm_boundary" {
  count = var.enable_ebs_snapshot_policy ? 1 : 0
  arn   = var.dlm_permissions_boundary_arn
  lifecycle {
    postcondition {
      condition     = self.arn == module.permissions_contract.boundary_arns.dlm && jsondecode(self.policy) == jsondecode(module.permissions_contract.dlm_boundary)
      error_message = "The DLM boundary must match the reviewed external policy."
    }
  }
}
locals {
  common_tags = merge(var.tags, {
    Stage = "preview"
  })
}

# Guard rails. These are preconditions rather than documentation so that an
# accidental apply fails instead of publishing something that was not approved.
resource "terraform_data" "guard_rails" {
  lifecycle {
    precondition {
      condition     = var.environment == "beta"
      error_message = "This configuration only publishes the Beta environment."
    }

    precondition {
      condition     = !var.enable_authority_volume || var.authority_gate_acknowledged
      error_message = "enable_authority_volume requires authority_gate_acknowledged: the RecoveryAuthority provider and its external anchor must be decided first."
    }

    precondition {
      condition     = !var.enable_ebs_snapshot_policy || var.acknowledge_complementary_backups
      error_message = "enable_ebs_snapshot_policy requires acknowledge_complementary_backups: snapshots do not replace the approved backup and PITR path."
    }
  }
}

module "network" {
  source = "../../modules/network"

  project            = var.project
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  public_subnet_cidr = var.public_subnet_cidr
  tags               = local.common_tags
}

module "compute" {
  source = "../../modules/compute"

  project                  = var.project
  environment              = var.environment
  subnet_id                = module.network.public_subnet_id
  security_group_ids       = [module.network.edge_security_group_id]
  instance_type            = var.instance_type
  root_volume_size_gb      = var.root_volume_size_gb
  ami_id                   = var.ami_id
  app_log_group_name       = var.app_log_group_name
  permissions_boundary_arn = data.aws_iam_policy.workload_boundary.arn
  ssm_parameter_prefix     = var.ssm_parameter_prefix
  ssm_kms_key_arn          = var.ssm_kms_key_arn
  tags                     = local.common_tags

  depends_on = [terraform_data.guard_rails]
}

module "persistent_storage" {
  source = "../../modules/persistent-storage"

  project                  = var.project
  environment              = var.environment
  availability_zone        = module.network.availability_zone
  instance_id              = module.compute.instance_id
  db_volume_size_gb        = var.db_volume_size_gb
  media_volume_size_gb     = var.media_volume_size_gb
  create_authority_volume  = var.enable_authority_volume
  authority_volume_size_gb = var.authority_volume_size_gb
  tags                     = local.common_tags
}

module "dns" {
  source = "../../modules/dns"

  hosted_zone_id = var.hosted_zone_id
  record_name    = var.record_name
  domain         = var.domain
  target_ip      = module.compute.elastic_ip
  tags           = local.common_tags
}

module "monitoring" {
  source = "../../modules/monitoring"

  project            = var.project
  environment        = var.environment
  instance_id        = module.compute.instance_id
  log_group_name     = var.app_log_group_name
  alert_emails       = var.alert_emails
  monthly_budget_usd = var.monthly_budget_usd
  tags               = local.common_tags
}

module "snapshot_policy" {
  source = "../../modules/snapshot-policy"

  enabled                  = var.enable_ebs_snapshot_policy
  project                  = var.project
  environment              = var.environment
  tags                     = local.common_tags
  permissions_boundary_arn = var.enable_ebs_snapshot_policy ? data.aws_iam_policy.dlm_boundary[0].arn : null
}
