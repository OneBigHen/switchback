# GitHub Actions CI appliance

This directory provisions the disposable self-hosted runner LXC for private
`OneBigHen/*` repositories. Run `create-lxc.sh` on `megaplex`, not on a
development workstation.

The default live-safe values are:

- VMID: the next free Proxmox ID (the current deployment selected `125`)
- hostname: `github-ci`
- Debian: 13, because the existing Debian 13 Docker LXC on this host proves
  unprivileged Docker with `nesting=1,keyctl=1`
- 6 vCPU, 8192 MiB RAM, 2048 MiB swap, 80 GiB rootfs
- storage: `elitedesk-storage`
- network: DHCP on `vmbr0`

## Provision

```bash
scp -r infra/ci-runner megaplex:/root/ci-runner
ssh megaplex 'CI_VMID=125 /root/ci-runner/create-lxc.sh'
ssh megaplex 'pct exec 125 -- /root/ci-runner/bootstrap-ci.sh'
```

The bootstrap never receives GitHub credentials. It installs the toolchain,
Docker, browser dependencies, the latest runner archive, and the maintenance
timer. The runner remains unregistered until a short-lived GitHub registration
token is supplied interactively.

Docker group membership is intentionally limited to `github-runner`, but that
membership is effectively root-equivalent inside this disposable appliance.
