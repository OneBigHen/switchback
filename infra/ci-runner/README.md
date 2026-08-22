# GitHub Actions CI appliance

This directory provisions a disposable self-hosted runner LXC for trusted
manual/heavy workloads. Run `create-lxc.sh` on the site's Proxmox host, not on
a development workstation. Normal public pull requests use GitHub-hosted
runners and never target this appliance.

The site must provide these values explicitly:

- `CI_NODE`: Proxmox host name
- `CI_STORAGE`: target storage
- `CI_BRIDGE`: target network bridge

The portable defaults are an unprivileged Debian 13 LXC, `nesting=1,keyctl=1`,
6 vCPU, 8192 MiB RAM, 2048 MiB swap, 80 GiB rootfs, DHCP, and UTC. Override
them with `CI_*` variables when the site requires different capacity.

## Provision

```bash
scp -r infra/ci-runner <proxmox-host>:/root/ci-runner
ssh <proxmox-host> 'CI_NODE=<proxmox-host> CI_STORAGE=<storage> CI_BRIDGE=<bridge> CI_VMID=<lxc-vmid> /root/ci-runner/create-lxc.sh'
ssh <proxmox-host> 'pct exec <lxc-vmid> -- /root/ci-runner/bootstrap-ci.sh'
```

The bootstrap never receives GitHub credentials. It installs the toolchain,
Docker, browser dependencies, the latest runner archive, and the maintenance
timer. The runner remains unregistered until a short-lived GitHub registration
token is supplied interactively.

Docker group membership is intentionally limited to `github-runner`, but that
membership is effectively root-equivalent inside this disposable appliance.
