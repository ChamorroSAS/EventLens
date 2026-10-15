# Phoeve — Terraform for the closed Beta

This directory prepares the infrastructure for the Phase 1 publication of
`beta.phoeve.com` (SPA + public API + PostgreSQL) defined in
[`docs/aws-preview-deployment.md`](../../docs/aws-preview-deployment.md).

Nothing here has been applied. No resource is created until an operator runs
`terraform apply` in the authorised backend, and that step is explicitly out of
scope until the approvals listed in that document are recorded.

## Layout

```
infra/terraform/
├── modules/
│   ├── network/             VPC, one public subnet, IGW, route table, edge SG
│   ├── compute/             instance, IMDSv2-only, SSM-only access, Elastic IP, instance role
│   ├── persistent-storage/  PostgreSQL, media and (gated) authority volumes
│   ├── dns/                 the single A record for the published name
│   ├── monitoring/          log group, alarms and the monthly cost budget
│   ├── snapshot-policy/     complementary daily EBS snapshots (disabled by default)
│   └── identity/            GitHub OIDC deploy role and HCP Terraform plan/apply roles
└── environments/
    ├── bootstrap/           account-level identity only
    └── beta/                the published stack
```

Two roots on purpose: `bootstrap` creates trust (roles, providers) and can be
reviewed on its own; `beta` creates workload resources and must be planned with
the same roles the deployment workflow will use.

## Order of operations

1. `environments/bootstrap` — plan and apply first. It creates the GitHub OIDC
   provider (or references an existing one), the deployment role and, when HCP
   Terraform is used, the plan and apply roles.
2. `environments/beta` — plan and apply second. It creates the network, the
   host, the data volumes, the record, the alarms and the budget.
3. Host preparation — `infra/beta/deploy/bootstrap-host.sh` over SSM Session
   Manager, passing the volume ids from the Beta outputs.
4. Secret parameters — created by an authorised operator in SSM Parameter Store
   (`SecureString`). Terraform never reads or writes secret values.
5. Deployment — the workflow in `.github/workflows/deploy-beta.yml`, which calls
   the stable entry point on the host.

Applying out of order fails safely: the Beta stack cannot start without its data
volume (`RequiresMountsFor` plus the mount guard) and cannot be deployed without
the rendered environment file.

## Remote state

The backend block is not committed. Copy the template in the root you are
working with:

```bash
cd infra/terraform/environments/beta
cp backend.hcp.tf.tpl backend.hcp.tf   # fill in organisation and workspace
terraform init
```

`backend.hcp.tf` is git-ignored. Local state must not be used: it would turn the
state file into an unmanaged secret store and break the review trail.

## Commands

Static validation (no cloud access, safe at any time):

```bash
terraform -chdir=infra/terraform/environments/beta fmt -check -recursive
terraform -chdir=infra/terraform/environments/beta init -backend=false
terraform -chdir=infra/terraform/environments/beta validate
```

The same commands work for `environments/bootstrap`.

Bootstrap regression tests use a mocked AWS provider and plan-only runs:

```bash
# From the repository root, after bootstrap init -backend=false:
node scripts/verify-bootstrap-plan.mjs
```

This verifies input guards (including targeted plans), known HCP policy values
and exact fixture OIDC trusts. It does not run an AWS plan or authorise apply.
See [the corrective report and CloudShell checklist](../../docs/terraform-bootstrap-iam-corrective.md)
for the dependency graph, evidence and legitimate computed ARN limitations.

Planning requires the authorised backend and credentials:

```bash
terraform -chdir=infra/terraform/environments/beta plan -out=tfplan
```

`terraform apply` is never run by CI and never without the recorded approvals.

## Guard rails

| Control | Where |
| --- | --- |
| Only the Beta stage can be applied from this root | `validation` on `environment` |
| Only `us-east-1` | `validation` on `region` |
| The RecoveryAuthority volume cannot be created without an explicit acknowledgement | `terraform_data.guard_rails` precondition |
| The snapshot policy cannot be enabled without acknowledging it is complementary | `terraform_data.guard_rails` precondition |
| Data volumes are never destroyed by a routine apply | `lifecycle { prevent_destroy = true }` |
| The published record is never destroyed by a routine apply | `lifecycle { prevent_destroy = true }` |
| The authority volume is excluded from the snapshot policy | tags (`SnapshotPolicy` is only set on operational volumes) |
| The deployment role cannot create or modify infrastructure | `modules/identity` policy statements |
| Administration without SSH | no key pair, inbound 80/443 only, SSM Session Manager |

## Cost expectations

The prepared topology is intentionally minimal: one instance, one public subnet,
no NAT Gateway, two gp3 volumes plus one root volume, one Elastic IP, one hosted
record, log retention of 30 days and one SNS topic. A NAT Gateway and a
load balancer are the two items most likely to dominate cost if they are added
later; neither is part of this configuration.

The budget alarm in `modules/monitoring` is a notification, not a hard limit.
