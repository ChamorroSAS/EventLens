data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# Official Amazon Linux 2023 ARM64 image, resolved from the public SSM path.
data "aws_ssm_parameter" "amazon_linux_2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  ami_id = coalesce(var.ami_id, data.aws_ssm_parameter.amazon_linux_2023_arm64.value)

  ssm_kms_key_arn = (
    var.ssm_kms_key_arn != null
    ? var.ssm_kms_key_arn
    : "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"
  )
}

resource "aws_iam_role" "instance" {
  name = "${var.project}-${var.environment}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.tags
}

# Administration happens through SSM Session Manager: no SSH port, no key pair.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_policy" "instance_runtime" {
  name        = "${var.project}-${var.environment}-instance-runtime"
  description = "Least-privilege runtime access for the ${var.environment} host: configuration parameters and application logs."

  policy = jsonencode({
    Version = "2012-11-01"
    Statement = [
      {
        Sid    = "ReadDeploymentParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_parameter_prefix}",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_parameter_prefix}/*"
        ]
      },
      {
        Sid      = "DecryptSecureParameters"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.ssm_kms_key_arn != null ? var.ssm_kms_key_arn : "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
      },
      {
        Sid    = "WriteApplicationLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:${var.app_log_group_name}:*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "instance_runtime" {
  role       = aws_iam_role.instance.name
  policy_arn = aws_iam_policy.instance_runtime.arn
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.project}-${var.environment}-instance"
  role = aws_iam_role.instance.name
}

resource "aws_instance" "beta" {
  ami                    = var.ami_id != null ? var.ami_id : data.aws_ssm_parameter.amazon_linux_2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = var.security_group_ids
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Administration only through SSM Session Manager: no key pair is attached.
  key_name = null

  instance_initiated_shutdown_behavior = "stop"

  # IMDSv2 only, and no IMDS access from containers (hop limit 1).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data                   = templatefile("${path.module}/templates/user_data.sh.tftpl", { environment = var.environment })
  user_data_replace_on_change = false

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-host" })

  lifecycle {
    # The instance must not be silently replaced: data volumes and the edge
    # address are attached to this host.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "beta" {
  domain = "vpc"

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-edge" })
}

resource "aws_eip_association" "beta" {
  instance_id   = aws_instance.beta.id
  allocation_id = aws_eip.beta.id
}
