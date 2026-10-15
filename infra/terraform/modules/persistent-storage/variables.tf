variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "availability_zone" {
  description = "Availability zone of the Beta instance. EBS volumes must live in the same zone."
  type        = string
}

variable "instance_id" {
  description = "Identifier of the instance the data volumes are attached to."
  type        = string
}

variable "db_volume_size_gb" {
  description = "Size of the PostgreSQL data volume."
  type        = number
  default     = 30
}

variable "media_volume_size_gb" {
  description = "Size of the media volume. It is prepared but only used once the Beta media provider is approved."
  type        = number
  default     = 40
}

variable "create_authority_volume" {
  description = <<-EOT
    Whether to create the dedicated RecoveryAuthority volume.

    It defaults to false on purpose: creating the device must not be read as
    approving a recovery authority. Enabling it requires the EL-TK-252 gate and
    an explicit decision about the authority provider and its external anchor.
  EOT
  type        = bool
  default     = false
}

variable "authority_volume_size_gb" {
  description = "Size of the RecoveryAuthority volume when create_authority_volume is true."
  type        = number
  default     = 8
}

variable "db_device_name" {
  description = "Device name requested for the PostgreSQL data volume."
  type        = string
  default     = "/dev/sdf"
}

variable "media_device_name" {
  description = "Device name requested for the media volume."
  type        = string
  default     = "/dev/sdg"
}

variable "authority_device_name" {
  description = "Device name requested for the RecoveryAuthority volume."
  type        = string
  default     = "/dev/sdh"
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
