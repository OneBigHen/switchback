# Switchback self-hosted CI appliance

This is a disposable, isolated GitHub Actions worker for private
`OneBigHen/*` repositories. GitHub remains the control plane; the LXC only
provides build/test compute and Docker for disposable services.

## Live deployment

| Field | Value |
|---|---|
| Proxmox node | `megaplex` (`192.168.1.216`) |
| Proxmox | `pve-manager 9.2.11`, `proxmox-ve 9.2.0` |
| VMID | `125` |
| hostname | `github-ci` |
| IP | `192.168.1.236` (DHCP on `vmbr0`) |
| OS | Debian 13 (Trixie) |
| LXC | unprivileged |
| vCPU / RAM / swap | 6 / 8192 MiB / 2048 MiB |
| rootfs / storage | 80 GiB / `elitedesk-storage` |
| bridge | `vmbr0` |
| features | `nesting=1,keyctl=1` only |
| inbound firewall | Proxmox guest firewall enabled, inbound DROP, DHCP and LAN ICMP only |

Debian 13 is intentional here: the existing Debian 13 Docker LXC on this
node already proves unprivileged Docker with the same two LXC features and
the host's overlayfs/cgroup-v2 kernel. No privileged mode, host Docker socket,
host filesystem mount, broad device access, or public port is used.

## Appliance toolchain

The `github-runner` user owns `/home/github-runner` and `/opt/actions-runner`.
The image contains Git, Git LFS, GitHub CLI, Node.js LTS, npm, Corepack/pnpm,
Python 3, build tools, `osmium-tool`, Java 21 runtime, Docker Engine, Compose
v2, and Playwright browser dependencies. Browser downloads, npm/pnpm caches,
and Docker layers remain local for speed.

Membership in the Docker group is root-equivalent inside this appliance. It
does not grant access to the Proxmox host, but a compromised workflow can
control every Docker resource in this LXC; rebuild the LXC rather than trust
it after a serious compromise.

## Runner registration

The runner is prepared under `/opt/actions-runner` but must not be configured
with a PAT. The deployed runner is currently repository-scoped to
`OneBigHen/switchback`; organization runner-group administration was not
available to the local GitHub CLI credential. It is online as `github-ci`.

The repository runner page is:

`https://github.com/OneBigHen/switchback/settings/actions/runners`

For a future organization-scoped enrollment, create or restrict the group at:

`https://github.com/organizations/OneBigHen/settings/actions/runner-groups`

Then use the organization's **New self-hosted runner** page to obtain its
short-lived token and run this command. Paste the token only at the prompt;
it is read from stdin and is not written to a script or shell history:

```bash
ssh -t megaplex 'pct exec 125 -- /root/ci-runner/install-actions-runner.sh --register --scope https://github.com/OneBigHen --runner-group homelab-ci'
```

If organization registration is unavailable, use the repository page's
**Settings → Actions → Runners → New self-hosted runner** token instead:

```bash
ssh -t megaplex 'pct exec 125 -- /root/ci-runner/install-actions-runner.sh --register --scope https://github.com/OneBigHen/switchback'
```

When an authenticated local `gh` session has repository administration access,
the same short-lived token can be piped directly without copying Docker-dev
credentials or storing a token:

```bash
gh api --method POST repos/OneBigHen/switchback/actions/runners/registration-token --jq .token |
  ssh -T megaplex 'pct exec 125 -- /root/ci-runner/install-actions-runner.sh --register --scope https://github.com/OneBigHen/switchback'
```

The service is created by the supported `svc.sh` mechanism after registration.
Check it with:

```bash
ssh megaplex 'pct exec 125 -- systemctl list-units --type=service --all --no-pager "actions.runner.*.service"'
ssh megaplex 'pct exec 125 -- journalctl -u "actions.runner.*.service" -n 100 --no-pager'
```

GitHub should show runner `github-ci` as Online/Idle with built-in
`self-hosted`, `Linux`, `X64` labels plus `linux`, `x64`, and `homelab-ci`.
Only one runner agent exists, so concurrency is one job.

## Workflows

Quality jobs target:

```yaml
runs-on: [self-hosted, linux, x64, homelab-ci]
```

The persistent checkout is cleaned by `actions/checkout`, production builds
also remove `.next`, and jobs retain useful package/browser caches. The manual
diagnostic workflow is `.github/workflows/self-hosted-runner-smoke.yml`:

```bash
gh workflow run self-hosted-runner-smoke.yml --repo OneBigHen/switchback --ref main
gh run watch --repo OneBigHen/switchback
```

It reports host/tool versions and exercises Node, Docker, Compose, Chromium,
and WebKit. `live-smoke` remains honest about missing provider credentials;
no credentials are stored in this LXC.

## Maintenance

`ci-maintenance.timer` runs daily around 03:40 America/New_York with a
15-minute jitter and keeps journal logs for 30 days, capped at 512 MiB
persistent / 128 MiB runtime storage. The script logs disk, memory, and Docker
usage before and after cleanup.

- Every daily run prunes stopped containers, unused networks, dangling images,
  build cache older than 7 days, npm/pnpm cache metadata, and old `_work`
  directories.
- At 75% disk: record a warning in the service journal.
- At 85% disk: also prune unused images and all old disposable build cache.
- At 90% memory: record a warning in the service journal.
- If a `Runner.Worker` process exists, destructive cleanup is skipped.
- Docker volumes are never pruned by this maintenance path.

```bash
ssh megaplex 'pct exec 125 -- systemctl status ci-maintenance.timer --no-pager'
ssh megaplex 'pct exec 125 -- systemctl start ci-maintenance.service'
ssh megaplex 'pct exec 125 -- journalctl -u ci-maintenance.service -n 100 --no-pager'
```

## Drain, disable, and re-register

To drain before host work, wait for the current job to finish, then stop the
runner service. Do not destroy the LXC while GitHub still shows a job running.

```bash
ssh megaplex 'pct exec 125 -- /opt/actions-runner/svc.sh stop'
ssh megaplex 'pct exec 125 -- /opt/actions-runner/svc.sh status'
```

For a stale registration, obtain a fresh removal token from the same GitHub
scope, stop/uninstall the service, remove the registration, and register again
with a fresh registration token:

```bash
ssh megaplex 'pct exec 125 -- /opt/actions-runner/svc.sh stop'
ssh megaplex 'pct exec 125 -- /opt/actions-runner/svc.sh uninstall'
ssh megaplex 'pct exec 125 -- /opt/actions-runner/config.sh remove'
```

The final command prompts for the short-lived removal token. Do not paste a
PAT into the LXC.

## Rebuild from scratch

The LXC is not precious state. After draining and removing its GitHub runner,
destroy only VMID 125 and rerun the provisioning scripts from this repository:

```bash
ssh megaplex 'pct destroy 125 --purge'
scp -r infra/ci-runner megaplex:/root/ci-runner
ssh megaplex 'CI_VMID=125 /root/ci-runner/create-lxc.sh'
ssh megaplex 'pct exec 125 -- /root/ci-runner/bootstrap-ci.sh'
```

This intentionally loses checkouts, Docker layers, npm/pnpm caches, and
Playwright downloads. Durable state is the scripts and GitHub workflow files.

## Troubleshooting

```bash
ssh megaplex 'pct status 125; pct config 125'
ssh megaplex 'pct exec 125 -- ip -4 -brief addr show dev eth0'
ssh megaplex 'pct exec 125 -- systemctl status docker --no-pager'
ssh megaplex 'pct exec 125 -- docker info'
ssh megaplex 'pct exec 125 -- journalctl -u docker -n 100 --no-pager'
ssh megaplex 'pct exec 125 -- journalctl -u "actions.runner.*.service" -n 200 --no-pager'
```

If Docker fails, first confirm the LXC is still unprivileged and retains only
`nesting=1,keyctl=1`; do not add host sockets, devices, or privileged mode as
a shortcut. If Playwright fails, rerun the repository's versioned
`npx playwright install chromium webkit` and inspect the browser launch error;
do not add `--no-sandbox` without proving the kernel/LXC cause.
