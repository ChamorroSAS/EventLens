#!/usr/bin/env bash
# Phoeve Beta — mount guard.
#
# Refuses to start the stack when a data volume is missing, or when the mounted
# filesystem is not the volume this deployment expects. This is what prevents a
# failed attach or a stray device from silently becoming the PostgreSQL data
# directory on the root filesystem.
#
# Usage: phoeve-mount-guard --from-env /etc/phoeve/beta-volumes.env
set -euo pipefail

guard_volume() {
  local volume_id="$1"
  local mount_path="$2"

  if ! mountpoint -q "$mount_path"; then
    printf 'mount guard: %s is not mounted\n' "$mount_path" >&2
    return 1
  fi

  local marker_file="${mount_path}/.phoeve-volume-id"
  if [[ ! -f "$marker_file" ]]; then
    printf 'mount guard: %s has no volume marker\n' "$mount_path" >&2
    return 1
  fi

  local actual
  actual="$(cat "$marker_file")"
  if [[ "$actual" != "$volume_id" ]]; then
    printf 'mount guard: %s holds %s but %s was expected\n' "$mount_path" "$actual" "$volume_id" >&2
    return 1
  fi

  printf 'mount guard: %s verified (%s)\n' "$mount_path" "$volume_id"
}

env_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-env) env_file="${2:?}"; shift 2 ;;
    --help|-h) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [[ -z "$env_file" ]]; then
  printf 'usage: phoeve-mount-guard --from-env <file>\n' >&2
  exit 2
fi
if [[ ! -r "$env_file" ]]; then
  printf 'mount guard: %s is not readable\n' "$env_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$env_file"

if [[ -z "${DATABASE_VOLUME:-}" ]]; then
  printf 'mount guard: DATABASE_VOLUME is not declared in %s\n' "$env_file" >&2
  exit 1
fi

guard_volume "$DATABASE_VOLUME" /srv/phoeve/beta/postgres
if [[ -n "${MEDIA_VOLUME:-}" ]]; then
  guard_volume "$MEDIA_VOLUME" /srv/phoeve/beta/media
fi
