#!/usr/bin/env bash

resolve_switchback_data_root() {
  if [[ -n "${SWITCHBACK_DATA_ROOT:-}" ]]; then
    printf '%s\n' "$SWITCHBACK_DATA_ROOT"
    return 0
  fi

  local compose_file="${BASH_SOURCE[0]%/*}/../docker-compose.production.yml"
  local container_id
  local ids
  local mount_source
  local existing_source
  local artifact
  local legacy_root="${SWITCHBACK_LEGACY_DATA_ROOT:-/var/lib/switchback}"
  local -a container_ids=()
  local -a data_sources=()

  if command -v docker >/dev/null 2>&1; then
    if [[ -f "$compose_file" ]] && ids="$(docker compose -f "$compose_file" ps -aq web 2>/dev/null)"; then
      while IFS= read -r container_id; do
        [[ -n "$container_id" ]] && container_ids+=("$container_id")
      done <<<"$ids"
    fi

    if ((${#container_ids[@]} == 0)) && ids="$(docker ps -aq --filter label=com.docker.compose.service=web 2>/dev/null)"; then
      while IFS= read -r container_id; do
        [[ -n "$container_id" ]] && container_ids+=("$container_id")
      done <<<"$ids"
    fi

    for container_id in "${container_ids[@]}"; do
      if mount_source="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{"\n"}}{{end}}{{end}}' "$container_id" 2>/dev/null)"; then
        while IFS= read -r mount_source; do
          [[ -z "$mount_source" ]] && continue
          local duplicate=false
          for existing_source in "${data_sources[@]}"; do
            if [[ "$existing_source" == "$mount_source" ]]; then
              duplicate=true
              break
            fi
          done
          [[ "$duplicate" == false ]] && data_sources+=("$mount_source")
        done <<<"$mount_source"
      fi
    done
  fi

  if ((${#data_sources[@]} == 1)); then
    printf '%s\n' "${data_sources[0]}"
    return 0
  fi
  if ((${#data_sources[@]} > 1)); then
    printf 'Unable to resolve Switchback data root: ambiguous Docker /data mount sources\n' >&2
    return 1
  fi

  if [[ -d "$legacy_root" ]] && {
    [[ -f "$legacy_root/app/community.sqlite" ]] ||
      [[ -f "$legacy_root/app/sync.sqlite" ]] ||
      { [[ -d "$legacy_root/artifacts" ]] && artifact="$(find "$legacy_root/artifacts" -type f -print -quit 2>/dev/null)" && [[ -n "$artifact" ]]; };
  }; then
    printf '%s\n' "$legacy_root"
    return 0
  fi

  printf 'Unable to resolve Switchback data root: set SWITCHBACK_DATA_ROOT or expose the production web /data mount\n' >&2
  return 1
}
