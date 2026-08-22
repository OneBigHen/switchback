# Switchback self-hosted CI appliance

This repository includes a disposable, unprivileged GitHub Actions appliance
for trusted manual, heavy, or soak workloads. GitHub remains the control plane.
Normal public pull requests run on fresh GitHub-hosted runners and never use
this LXC.

All values below are site-specific placeholders. The committed repository does
not depend on a particular Proxmox host, VMID, LAN, storage name, IP address,
checkout path, or private hostname.

| Site value | Replace with |
|---|---|
| Proxmox host | `<proxmox-host>` |
| LXC VMID | `<lxc-vmid>` |
| Runner IP | `<runner-ip>` (normally DHCP) |
| Repository | `<owner>/<repository>` |
| Host checkout | `/path/to/repo` |

## Security boundary

- The LXC is unprivileged and uses only `nesting=1,keyctl=1` for Docker.
- It has no host Docker socket, host filesystem mount, production secret, or
  private SSH key.
- Docker access is root-equivalent inside the disposable guest; rebuild the
  guest after a serious workflow compromise.
- The only self-hosted workflow in this release is
  `.github/workflows/homelab-ci-smoke.yml`, which is manual and refuses any ref
  other than `main` before it reaches the LXC.
- Never change a pull-request job to `self-hosted`, and never run arbitrary fork
  code on the appliance.

## Appliance contract

`infra/ci-runner/` provisions an unprivileged Debian 13 LXC with these portable
defaults:

- 6 vCPU, 8192 MiB RAM, 2048 MiB swap, 80 GiB rootfs
- DHCP networking, UTC timezone, inbound firewall policy `DROP`
- Git, Git LFS, GitHub CLI, Node.js LTS, npm, Corepack/pnpm, Python 3,
  `osmium-tool`, Java 21, Docker Engine, Compose v2, and Playwright browser
  dependencies
- one `github-runner` user owning the runner and its local caches

Override capacity or site values with the documented `CI_*` environment
variables. Keep the runner disposable; the durable state is this directory and
the GitHub workflow configuration.

## Create and bootstrap

Run the provisioning script on the Proxmox host. Do not run it from a developer
workstation or against a production application guest.

```bash
scp -r infra/ci-runner <proxmox-host>:/root/ci-runner
ssh <proxmox-host> 'CI_NODE=<proxmox-host> CI_STORAGE=<storage> CI_BRIDGE=<bridge> CI_VMID=<lxc-vmid> /root/ci-runner/create-lxc.sh'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- /root/ci-runner/bootstrap-ci.sh'
```

`create-lxc.sh` checks that the host, storage, bridge, VMID, Debian template,
and free space are valid before creating the guest. `bootstrap-ci.sh` installs
the toolchain, Docker, browsers, and maintenance timer but never receives a
GitHub credential.

## Register the runner

Registration uses a short-lived token generated for the exact repository or
approved organization. Paste it only at the interactive prompt or pipe it
directly; do not store it in a file, script, environment snapshot, or shell
history.

```bash
repository='<owner>/<repository>'
gh api --method POST "repos/$repository/actions/runners/registration-token" --jq .token |
  ssh -T <proxmox-host> "pct exec <lxc-vmid> -- /root/ci-runner/install-actions-runner.sh --register --scope https://github.com/$repository"
```

The runner should appear as Online/Idle with GitHub's built-in `self-hosted`,
`Linux`, and `X64` labels plus the custom `homelab-ci` label. The smoke workflow
uses `[self-hosted, linux, x64, homelab-ci]` and therefore must remain limited to
trusted `main` dispatches.

Check the service and runner state from the Proxmox host:

```bash
ssh <proxmox-host> 'pct exec <lxc-vmid> -- systemctl list-units --type=service --all --no-pager "actions.runner.*.service"'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- journalctl -u "actions.runner.*.service" -n 100 --no-pager'
```

## Trusted smoke workflow

Dispatch only from the trusted release ref after it is on `main`:

```bash
gh workflow run homelab-ci-smoke.yml --repo <owner>/<repository> --ref main
gh run watch --repo <owner>/<repository>
```

The workflow reports Node, Docker, Compose, Chromium, and WebKit. It creates
only disposable smoke containers and checks out the exact trusted `main` ref.

## Maintenance

`ci-maintenance.timer` runs daily with a small randomized delay. It prunes
stopped containers, unused networks, dangling images, and old Docker build
cache. It never prunes Docker volumes or runner workspaces. If a `Runner.Worker`
process is active, destructive cleanup is skipped.

```bash
ssh <proxmox-host> 'pct exec <lxc-vmid> -- systemctl status ci-maintenance.timer --no-pager'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- systemctl start ci-maintenance.service'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- journalctl -u ci-maintenance.service -n 100 --no-pager'
```

## Drain, remove, and rebuild

Wait for any job to finish, stop the service, and remove the GitHub runner
registration with a fresh short-lived removal token before destroying the LXC.

```bash
ssh <proxmox-host> 'pct exec <lxc-vmid> -- /opt/actions-runner/svc.sh stop'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- /opt/actions-runner/svc.sh uninstall'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- /opt/actions-runner/config.sh remove'
ssh <proxmox-host> 'pct destroy <lxc-vmid> --purge'
```

The final command prompts for the removal token. Recreate the appliance by
rerunning the provisioning sequence above. Checkouts, Docker layers, package
caches, and browser downloads are intentionally disposable.

## Troubleshooting

```bash
ssh <proxmox-host> 'pct status <lxc-vmid>; pct config <lxc-vmid>'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- systemctl status docker --no-pager'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- docker info'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- journalctl -u docker -n 100 --no-pager'
```

If Docker fails, verify that the guest is still unprivileged and has only the
two required LXC features. If Playwright fails, reinstall the repository's
versioned browser dependencies and inspect the launch error; do not add
`--no-sandbox` or host mounts as a shortcut.
