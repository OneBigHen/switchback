#!/usr/bin/env bash
set -euo pipefail

runner_root="${CI_RUNNER_ROOT:-/opt/actions-runner}"
runner_user="github-runner"
runner_home="/home/${runner_user}"

log() { printf 'ci-maintenance: %s\n' "$*"; }
disk_percent() { df --output=pcent "$runner_root" | tail -n 1 | tr -dc '0-9'; }
runner_busy() { pgrep -f 'Runner.Worker' >/dev/null 2>&1; }

[[ ${EUID} -eq 0 ]] || { log "must run as root" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { log "docker is not installed" >&2; exit 1; }

before="$(disk_percent)"
memory_percent="$(awk '/MemTotal:/ { total=$2 } /MemAvailable:/ { available=$2 } END { if (total) printf "%d", ((total - available) * 100) / total; else print 0 }' /proc/meminfo)"
log "disk before: ${before}%"
log "memory before: ${memory_percent}%"
df -h "$runner_root"
free -h
docker system df

if runner_busy; then
  log "Runner.Worker is active; skipping destructive cleanup"
  exit 0
fi

log "running routine disposable-cache cleanup"
docker container prune --force
docker network prune --force
docker image prune --force
docker builder prune --force --filter until=168h
if (( before >= 75 )); then
  log "disk is at or above 75%; routine cleanup completed under warning threshold"
fi

if (( before >= 85 )); then
  log "disk is at or above 85%; running aggressive disposable-cache cleanup"
  docker image prune --all --force --filter until=168h
  docker builder prune --all --force --filter until=168h
fi

after="$(disk_percent)"
memory_after_percent="$(awk '/MemTotal:/ { total=$2 } /MemAvailable:/ { available=$2 } END { if (total) printf "%d", ((total - available) * 100) / total; else print 0 }' /proc/meminfo)"
log "disk after: ${after}%"
log "memory after: ${memory_after_percent}%"
if (( memory_after_percent >= 90 )); then
  log "WARNING: memory pressure is at or above 90%"
fi
df -h "$runner_root"
free -h
docker system df
