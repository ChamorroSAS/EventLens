variable "project" {
  description = "Product or system name used for tagging and resource naming."
  type        = string
  default     = "phoeve"
}

variable "environment" {
  description = "Deployment stage name (for example: beta)."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated Beta VPC."
  type        = string
  default     = "10.60.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the single public subnet that hosts the Beta instance."
  type        = string
  default     = "10.60.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone for the public subnet. When null, the first available zone of the region is used."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
