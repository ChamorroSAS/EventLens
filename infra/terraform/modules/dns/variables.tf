variable "hosted_zone_id" {
  description = "Existing Route 53 hosted zone for the apex domain. The zone itself is never managed here."
  type        = string
}

variable "record_name" {
  description = "Subdomain to publish (the part before the domain)."
  type        = string
  default     = "beta"
}

variable "domain" {
  description = "Apex domain that owns the hosted zone."
  type        = string
  default     = "phoeve.com"
}

variable "target_ip" {
  description = "Elastic IP the record points to."
  type        = string
}

variable "ttl" {
  description = "Record TTL in seconds. Short enough to follow an Elastic IP move."
  type        = number
  default     = 60
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}
