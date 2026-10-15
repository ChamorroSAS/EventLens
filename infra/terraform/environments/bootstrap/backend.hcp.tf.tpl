# HCP Terraform remote state — copy to backend.hcp.tf and fill in.
#
# Replace __HCP_ORGANIZATION__ and __HCP_BOOTSTRAP_WORKSPACE__ with the values
# agreed in the authorisation for the remote backend. This workspace creates the
# account-level identity below, so it must be reviewed separately from the Beta
# workspace and must never be auto-applied.
#
#   cp backend.hcp.tf.tpl backend.hcp.tf
#   terraform init
#
# backend.hcp.tf is not committed.

terraform {
  cloud {
    organization = "__HCP_ORGANIZATION__"

    workspaces {
      name = "__HCP_BOOTSTRAP_WORKSPACE__"
    }
  }
}
