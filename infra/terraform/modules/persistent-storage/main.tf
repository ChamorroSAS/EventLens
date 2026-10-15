data "aws_region" "current" {}

locals {
  tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  # Only the operational volumes are offered to the snapshot policy. The
  # authority volume is deliberately excluded so that a joint rollback can never
  # rewind the security timeline together with the database (ARCH-010, DEC-112).
  snapshot_tags = {
    SnapshotPolicy = "daily"
  }
}

# PostgreSQL data. Recovery relies on the approved backup path (continuous
# archiving plus PITR); this volume is not by itself a recovery guarantee.
resource "aws_ebs_volume" "database" {
  availability_zone = var.availability_zone
  size              = var.db_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = merge(local.tags, local.snapshot_tags, {
    Name          = "${var.project}-${var.environment}-database"
    DataRole      = "database"
    DataVolume    = "true"
    MountPathHint = "/srv/phoeve/beta/postgres"
  })

  # Data volumes are never destroyed by a routine apply.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "database" {
  device_name = var.db_device_name
  volume_id   = aws_ebs_volume.database.id
  instance_id = var.instance_id
}

# Media storage. Prepared for the Beta media provider, which stays unapproved:
# the application refuses every upload path while the media provider is absent.
resource "aws_ebs_volume" "media" {
  availability_zone = var.availability_zone
  size              = var.media_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = merge(local.tags, local.snapshot_tags, {
    Name          = "${var.project}-${var.environment}-media"
    DataRole      = "media"
    DataVolume    = "true"
    MountPathHint = "/srv/phoeve/beta/media"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "media" {
  device_name = var.media_device_name
  volume_id   = aws_ebs_volume.media.id
  instance_id = var.instance_id
}

# Dedicated RecoveryAuthority device. Gated behind create_authority_volume.
resource "aws_ebs_volume" "authority" {
  count = var.create_authority_volume ? 1 : 0

  availability_zone = var.availability_zone
  size              = var.authority_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = merge(local.tags, {
    Name          = "${var.project}-${var.environment}-authority"
    DataRole      = "recovery-authority"
    DataVolume    = "false"
    MountPathHint = "/srv/phoeve/beta/authority"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "authority" {
  count = var.create_authority_volume ? 1 : 0

  device_name = var.authority_device_name
  volume_id   = aws_ebs_volume.authority[0].id
  instance_id = var.instance_id
}
