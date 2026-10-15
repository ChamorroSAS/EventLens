mock_provider "aws" {
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
}
variables {
  hosted_zone_id = "ZTESTBETA"
  allowed_ami_id = "ami-0123456789abcdef0"
}
run "standalone_boundaries_fit_iam_limits" {
  command = plan
  assert {
    condition     = alltrue([for p in aws_iam_policy.boundary : length(p.policy) <= 6144 && jsondecode(p.policy).Version == "2012-10-17"])
    error_message = "Boundaries must be valid-version policies within the managed-policy quota."
  }
  assert {
    condition     = output.boundary_arns.control == "arn:aws:iam::123456789012:policy/phoeve-beta-control-boundary"
    error_message = "The independent root must expose the same predetermined boundary ARN as bootstrap."
  }
}
