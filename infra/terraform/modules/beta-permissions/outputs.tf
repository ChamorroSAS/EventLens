output "apply_policies" { value = local.apply_policies }
output "control_boundary" { value = local.control_boundary }
output "workload_boundary" { value = local.workload_boundary }
output "dlm_boundary" { value = local.dlm_boundary }
output "boundary_arns" {
  value = { control = local.control_bound, workload = local.workload_bound, dlm = local.dlm_bound }
}
