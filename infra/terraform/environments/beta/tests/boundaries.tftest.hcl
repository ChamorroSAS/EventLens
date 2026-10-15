mock_provider "aws" {
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
  mock_data "aws_region" { defaults = { name = "us-east-1" } }
  mock_data "aws_availability_zones" { defaults = { names = ["us-east-1a"] } }
}
variables {
  hosted_zone_id                    = "ZTESTBETA"
  ami_id                            = "ami-0123456789abcdef0"
  workload_permissions_boundary_arn = "arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"
}
override_data {
  target = data.aws_iam_policy.workload_boundary
  values = {
    arn    = "arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"
    policy = <<-JSON
{"Statement":[{"Action":["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],"Effect":"Allow","Resource":["arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta","arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta/*"]},{"Action":["logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams"],"Effect":"Allow","Resource":"arn:aws:logs:us-east-1:123456789012:log-group:/phoeve/beta/application:*"},{"Action":["ssm:DescribeAssociation","ssm:GetDeployablePatchSnapshotForInstance","ssm:GetDocument","ssm:DescribeDocument","ssm:GetManifest","ssm:ListAssociations","ssm:ListInstanceAssociations","ssm:PutInventory","ssm:PutComplianceItems","ssm:PutConfigurePackageResult","ssm:UpdateAssociationStatus","ssm:UpdateInstanceAssociationStatus","ssm:UpdateInstanceInformation","ssmmessages:CreateControlChannel","ssmmessages:CreateDataChannel","ssmmessages:OpenControlChannel","ssmmessages:OpenDataChannel","ec2messages:AcknowledgeMessage","ec2messages:DeleteMessage","ec2messages:FailMessage","ec2messages:GetEndpoint","ec2messages:GetMessages","ec2messages:SendReply"],"Effect":"Allow","Resource":"*"},{"Action":["kms:Decrypt"],"Condition":{"StringEquals":{"kms:ViaService":"ssm.us-east-1.amazonaws.com"},"StringLike":{"kms:EncryptionContext:PARAMETER_ARN":["arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta","arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta/*"]}},"Effect":"Allow","Resource":"*"}],"Version":"2012-10-17"}
JSON
  }
}
run "bounded_runtime_and_pinned_image" { command = plan }
run "reject_tampered_runtime_boundary" {
  command = plan
  override_data {
    target = data.aws_iam_policy.workload_boundary
    values = {
      arn    = "arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary"
      policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"*\",\"Resource\":\"*\"}]}"
    }
  }
  expect_failures = [data.aws_iam_policy.workload_boundary]
}
run "reject_unpinned_image" {
  command = plan
  variables { ami_id = "" }
  expect_failures = [var.ami_id]
}
run "reject_case_shadowed_tags" {
  command = plan
  variables { tags = { datarole = "database" } }
  expect_failures = [var.tags]
}
