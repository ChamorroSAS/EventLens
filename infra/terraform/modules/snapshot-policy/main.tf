locals {
  tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# Volumes are selected by the SnapshotPolicy tag written by the
# persistent-storage module. The RecoveryAuthority volume does not carry that
# tag, so a database rollback can never rewind the security timeline with it
# (ARCH-010, DEC-112).
resource "aws_dlm_lifecycle_policy" "daily" {
  count = var.enabled ? 1 : 0

  description        = "Daily snapshots of the ${var.environment} operational volumes."
  execution_role_arn = aws_iam_role.dlm[0].arn

  state = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]

    target_tags = {
      SnapshotPolicy = "daily"
    }

    schedule {
      name = "daily"

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = [var.snapshot_hour_utc]
      }

      retain_rule {
        count = var.retention_count
      }

      copy_tags = true

      tags_to_add = {
        SnapshotCreator = "dlm"
        Environment     = var.environment
      }
    }
  }

  tags = local.tags
}

data "aws_iam_policy_document" "dlm_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  count = var.enabled ? 1 : 0

  name               = "${var.project}-${var.environment}-dlm"
  description        = "Lifecycle role for EBS snapshots of the ${var.environment} volumes."
  assume_role_policy = data.aws_iam_policy_document.dlm_assume.json

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "dlm" {
  count = var.enabled ? 1 : 0

  role       = aws_iam_role.dlm[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}
