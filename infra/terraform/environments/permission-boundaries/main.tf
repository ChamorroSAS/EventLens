data "aws_caller_identity" "current" {}
module "permissions" {
  source         = "../../modules/beta-permissions"
  account_id     = data.aws_caller_identity.current.account_id
  hosted_zone_id = var.hosted_zone_id
  allowed_ami_id = var.allowed_ami_id
}
resource "aws_iam_policy" "boundary" {
  for_each = {
    control  = module.permissions.control_boundary
    workload = module.permissions.workload_boundary
    dlm      = module.permissions.dlm_boundary
  }
  name   = "phoeve-beta-${each.key}-boundary"
  policy = each.value
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = length(each.value) <= 6144
      error_message = "A managed permissions boundary exceeds the IAM policy size limit."
    }
  }
}
variable "hosted_zone_id" { type = string }
variable "allowed_ami_id" { type = string }
output "boundary_arns" { value = module.permissions.boundary_arns }
