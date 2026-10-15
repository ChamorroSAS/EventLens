data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  availability_zone = var.availability_zone != null ? var.availability_zone : data.aws_availability_zones.available.names[0]

  tags = merge(var.tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Stage       = "preview"
  })
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-igw" })
}

# Single public subnet: the Beta host needs outbound reachability (SSM, container
# registry, ACME, OS updates) and inbound 80/443 only. No NAT Gateway is created,
# which keeps the Preview cost at the level described in docs/aws-preview-deployment.md.
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = local.availability_zone
  map_public_ip_on_launch = false

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-public" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-public" })
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# Only the public edge is exposed. Ports 22, 3000, 4200, 4201, 5432 and any
# object-storage port are intentionally absent: administration happens through
# SSM Session Manager and every other service lives on a private Docker network.
resource "aws_security_group" "edge" {
  name_prefix = "${var.project}-${var.environment}-edge-"
  description = "Public edge: inbound HTTP/HTTPS only."
  vpc_id      = aws_vpc.main.id

  tags = merge(local.tags, { Name = "${var.project}-${var.environment}-edge" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.edge.id
  description       = "HTTP: ACME HTTP-01 challenge and redirect to HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.edge.id
  description       = "HTTPS: published Beta surface"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.edge.id
  description       = "Outbound HTTPS: SSM, container registry, ACME, OS updates"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "dns_udp" {
  security_group_id = aws_security_group.edge.id
  description       = "Outbound DNS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 53
  to_port           = 53
}

resource "aws_vpc_security_group_egress_rule" "dns_tcp" {
  security_group_id = aws_security_group.edge.id
  description       = "Outbound DNS over TCP (truncated responses, DNS-01 ACME)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 53
  to_port           = 53
}

resource "aws_vpc_security_group_egress_rule" "ntp" {
  security_group_id = aws_security_group.edge.id
  description       = "NTP time synchronisation (auditability of UTC anchors)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 123
  to_port           = 123
}
