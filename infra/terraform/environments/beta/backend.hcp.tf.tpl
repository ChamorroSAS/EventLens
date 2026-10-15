# HCP Terraform remote state — copy to backend.hcp.tf and fill in.
#
# Replace __HCP_ORGANIZATION__ and __HCP_WORKSPACE__ with the values agreed in the
# authorisation for the remote backend. Auto-apply must stay disabled and the
# workspace must use dynamic provider credentials (the plan/apply roles created
# by infra/terraform/environments/bootstrap).
#
#   cp backend.hcp.tf.tpl backend.hcp.tf
#   terraform init
#
# backend.hcp.tf is not committed.

terraform {
  cloud {
    organization = "__HCP_ORGANIZATION__"

    workspaces {
      name = "__HCP_WORKSPACE__"
    }
  }
}
