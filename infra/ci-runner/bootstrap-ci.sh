#!/usr/bin/env bash
set -euo pipefail

die() { echo "bootstrap-ci: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

[[ ${EUID} -eq 0 ]] || die "run as root inside the LXC"
for command in apt-get install systemctl; do need "$command"; done
[[ -r /etc/os-release ]] || die "missing /etc/os-release"
source /etc/os-release
[[ "$ID" == debian ]] || die "expected Debian, got $ID"
[[ "${VERSION_ID%%.*}" == 13 ]] || die "expected Debian 13, got ${VERSION_ID}"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runner_user="github-runner"
runner_home="/home/${runner_user}"
playwright_version="${CI_PLAYWRIGHT_VERSION:-1.61.1}"
timezone="${CI_TIMEZONE:-UTC}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y full-upgrade
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  wget \
  jq \
  unzip \
  zip \
  gnupg \
  build-essential \
  python3 \
  python3-pip \
  rsync \
  openssh-client \
  procps \
  lsof \
  file \
  git \
  git-lfs \
  gh \
  osmium-tool \
  openjdk-21-jre-headless \
  xz-utils

need curl
need runuser

apt-get purge -y postfix openssh-server openssh-sftp-server ssh

if ! id -u "$runner_user" >/dev/null 2>&1; then
  useradd --create-home --home-dir "$runner_home" --shell /bin/bash "$runner_user"
fi

[[ -f "/usr/share/zoneinfo/${timezone}" ]] || die "unknown CI_TIMEZONE: ${timezone}"
ln -snf "/usr/share/zoneinfo/${timezone}" /etc/localtime
printf '%s\n' "$timezone" > /etc/timezone

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
usermod -aG docker "$runner_user"
systemctl enable --now docker

curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y --no-install-recommends nodejs
corepack enable
if ! runuser -u "$runner_user" -- sh -c "cd '$runner_home' && pnpm --version" >/dev/null 2>&1; then
  runuser -u "$runner_user" -- sh -c "cd '$runner_home' && corepack install --global pnpm@latest"
fi

install -d -o "$runner_user" -g "$runner_user" \
  "$runner_home/.npm" \
  "$runner_home/.cache/ms-playwright" \
  "$runner_home/.local/share/pnpm"

install -d -m 0755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/ci-runner.conf <<'EOF'
[Journal]
SystemMaxUse=512M
RuntimeMaxUse=128M
MaxRetentionSec=30day
EOF
systemctl restart systemd-journald

for file in ci-maintenance.sh systemd/ci-maintenance.service systemd/ci-maintenance.timer; do
  [[ -f "$script_dir/$file" ]] || die "missing provisioning file: $script_dir/$file"
done
install -m 0755 "$script_dir/ci-maintenance.sh" /usr/local/sbin/ci-maintenance.sh
install -m 0644 "$script_dir/systemd/ci-maintenance.service" /etc/systemd/system/ci-maintenance.service
install -m 0644 "$script_dir/systemd/ci-maintenance.timer" /etc/systemd/system/ci-maintenance.timer
systemctl daemon-reload
systemctl enable --now ci-maintenance.timer

"$script_dir/install-actions-runner.sh" --prepare

tmp_playwright="$(mktemp -d /tmp/ci-playwright.XXXXXX)"
smoke_tag=""
cleanup_bootstrap() {
  if [[ -n "$smoke_tag" ]]; then
    runuser -u "$runner_user" -- docker image rm "$smoke_tag" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_playwright"
}
trap cleanup_bootstrap EXIT
install -d -o "$runner_user" -g "$runner_user" "$tmp_playwright"
chmod 0755 "$tmp_playwright"
runuser -u "$runner_user" -- env PLAYWRIGHT_BROWSERS_PATH="$runner_home/.cache/ms-playwright" \
  bash -c "cd '$tmp_playwright' && npm init -y >/dev/null && npm install --no-audit --no-fund --ignore-scripts '@playwright/test@${playwright_version}' >/dev/null"
"$tmp_playwright/node_modules/.bin/playwright" install-deps chromium webkit firefox
runuser -u "$runner_user" -- env PLAYWRIGHT_BROWSERS_PATH="$runner_home/.cache/ms-playwright" \
  "$tmp_playwright/node_modules/.bin/playwright" install chromium webkit firefox
cat > "$tmp_playwright/smoke.mjs" <<'EOF'
import { chromium, firefox, webkit } from "@playwright/test";

for (const [name, browserType] of Object.entries({ chromium, webkit, firefox })) {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("data:text/html,<main id='ready'>ci-ok</main>");
    const value = await page.locator("#ready").textContent();
    if (value !== "ci-ok") throw new Error(`${name} saw ${value}`);
    console.log(`${name}: PASS`);
  } finally {
    await browser.close();
  }
}
EOF
chown "$runner_user:$runner_user" "$tmp_playwright/smoke.mjs"
runuser -u "$runner_user" -- env PLAYWRIGHT_BROWSERS_PATH="$runner_home/.cache/ms-playwright" \
  node "$tmp_playwright/smoke.mjs"

runuser -u "$runner_user" -- node --version
runuser -u "$runner_user" -- npm --version
runuser -u "$runner_user" -- corepack --version
runuser -u "$runner_user" -- sh -c "cd '$runner_home' && pnpm --version"
runuser -u "$runner_user" -- git --version
runuser -u "$runner_user" -- gh --version | head -n 1
runuser -u "$runner_user" -- docker version
runuser -u "$runner_user" -- docker compose version
runuser -u "$runner_user" -- docker run --rm hello-world

smoke_tag="ci-runner-smoke:$(date +%s)"
{
  printf '%s\n' 'FROM alpine:3.22'
  printf '%s\n' 'CMD ["sh","-c","echo ci-container: PASS"]'
} | runuser -u "$runner_user" -- docker build --tag "$smoke_tag" -
runuser -u "$runner_user" -- docker run --rm "$smoke_tag"

echo "bootstrap-ci: base appliance checks passed"
