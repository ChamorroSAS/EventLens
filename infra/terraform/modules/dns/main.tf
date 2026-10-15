# Only the Beta record is managed. The hosted zone, its name servers and every
# other record in it stay outside this configuration on purpose: publishing the
# Beta must not be able to touch the apex or the delegation.
resource "aws_route53_record" "beta" {
  zone_id = var.hosted_zone_id
  name    = "${var.record_name}.${var.domain}"
  type    = "A"
  ttl     = var.ttl
  records = [var.target_ip]

  lifecycle {
    prevent_destroy = true
  }
}
