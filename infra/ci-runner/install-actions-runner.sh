#!/usr/bin/env bash
set -euo pipefail

die() { echo "install-actions-runner: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

[[ ${EUID} -eq 0 ]] || die "run as root inside the LXC"
for command in curl jq tar runuser systemctl; do need "$command"; done
id -u github-runner >/dev/null 2>&1 || die "github-runner user does not exist"

runner_root="${CI_RUNNER_ROOT:-/opt/actions-runner}"
runner_user="github-runner"
runner_name="${CI_RUNNER_NAME:-github-ci}"
runner_labels="${CI_RUNNER_LABELS:-self-hosted,linux,x64,homelab-ci}"

prepare() {
  install -d -o "$runner_user" -g "$runner_user" "$runner_root"
  if [[ -f "$runner_root/.runner" ]]; then
    echo "Runner is already configured at $runner_root"
    return 0
  fi

  release_json="$(curl -fsSL --retry 3 --retry-all-errors \
    -H 'Accept: application/vnd.github+json' \
    https://api.github.com/repos/actions/runner/releases/latest)"
  tag="$(jq -er '.tag_name' <<< "$release_json")"
  version="${tag#v}"
  [[ "$version" != "$tag" && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "unexpected runner release tag: $tag"
  asset_name="actions-runner-linux-x64-${version}.tar.gz"
  asset_url="$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .browser_download_url' <<< "$release_json")"
  asset_digest="$(jq -r --arg name "$asset_name" '.assets[] | select(.name == $name) | .digest // empty' <<< "$release_json")"

  archive="$(mktemp /tmp/actions-runner.XXXXXX.tar.gz)"
  trap 'rm -f "$archive"' RETURN
  curl -fL --retry 3 --retry-all-errors --output "$archive" "$asset_url"
  if [[ -n "$asset_digest" ]]; then
    [[ "$asset_digest" == sha256:* ]] || die "unsupported runner digest format: $asset_digest"
    echo "${asset_digest#sha256:}  $archive" | sha256sum --check --status
  fi

  tar -xzf "$archive" -C "$runner_root"
  chown -R "$runner_user:$runner_user" "$runner_root"
  printf '%s\n' "$version" > "$runner_root/.runner-version"
  chown "$runner_user:$runner_user" "$runner_root/.runner-version"
  "$runner_root/bin/installdependencies.sh"
  echo "Prepared actions-runner $version at $runner_root"
}

register() {
  local scope="" runner_group="" replace="false" token="" work="_work"
  while (($#)); do
    case "$1" in
      --scope) scope="${2:-}"; shift 2 ;;
      --runner-group) runner_group="${2:-}"; shift 2 ;;
      --name) runner_name="${2:-}"; shift 2 ;;
      --labels) runner_labels="${2:-}"; shift 2 ;;
      --work) work="${2:-}"; shift 2 ;;
      --replace) replace="true"; shift ;;
      *) die "unknown register argument: $1" ;;
    esac
  done
  [[ "$scope" =~ ^https://github\.com/[^/]+(/[^/]+)?/?$ ]] || die "--scope must be https://github.com/ORG or https://github.com/ORG/REPO"
  [[ -f "$runner_root/config.sh" ]] || die "runner is not prepared: $runner_root"
  [[ ! -f "$runner_root/.runner" || "$replace" == true ]] || die "runner is already configured; use --replace only after draining it"

  if [[ -t 0 ]]; then
    read -r -s -p "Paste the short-lived GitHub runner registration token: " token
    printf '\n' >&2
  else
    IFS= read -r token
  fi
  [[ -n "$token" ]] || die "no registration token received"

  config_args=(--unattended --url "$scope" --token "$token" --name "$runner_name" --labels "$runner_labels" --work "$work")
  [[ "$replace" == true ]] && config_args+=(--replace)
  [[ -n "$runner_group" ]] && config_args+=(--runnergroup "$runner_group")
  unset token
  runuser -u "$runner_user" -- "$runner_root/config.sh" "${config_args[@]}"
  "$runner_root/svc.sh" install "$runner_user"
  "$runner_root/svc.sh" start
  service_name="$(systemctl list-units --type=service --all --no-legend 'actions.runner.*.service' | awk 'NR == 1 { print $1 }')"
  [[ -n "$service_name" ]] || die "runner service was not created"
  systemctl --no-pager --full status "$service_name"
}

case "${1:---prepare}" in
  --prepare)
    (($# == 1)) || die "--prepare takes no extra arguments"
    prepare
    ;;
  --register)
    shift
    prepare
    register "$@"
    ;;
  *)
    die "usage: $0 --prepare | --register --scope https://github.com/ORG[/REPO] [--runner-group NAME] [--replace]"
    ;;
esac
