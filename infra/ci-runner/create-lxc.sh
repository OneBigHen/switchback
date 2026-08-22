#!/usr/bin/env bash
set -euo pipefail

die() { echo "create-lxc: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

[[ ${EUID} -eq 0 ]] || die "run on the Proxmox node as root"
for command in pct pvesh pvesm pveam; do need "$command"; done
[[ -d /etc/pve ]] || die "this is not a Proxmox host"

node="$(hostname -s)"
expected_node="${CI_NODE:-megaplex}"
[[ "$node" == "$expected_node" ]] || die "refusing to run on $node; expected $expected_node"

vmid="${CI_VMID:-$(pvesh get /cluster/nextid)}"
name="${CI_HOSTNAME:-github-ci}"
storage="${CI_STORAGE:-elitedesk-storage}"
template_storage="${CI_TEMPLATE_STORAGE:-$storage}"
debian_major="${CI_DEBIAN_MAJOR:-13}"
rootfs_size="${CI_ROOTFS_SIZE:-80G}"
cores="${CI_CORES:-6}"
memory_mb="${CI_MEMORY_MB:-8192}"
swap_mb="${CI_SWAP_MB:-2048}"
bridge="${CI_BRIDGE:-vmbr0}"
timezone="${CI_TIMEZONE:-America/New_York}"

[[ "$vmid" =~ ^[0-9]+$ ]] || die "invalid VMID: $vmid"
[[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die "invalid hostname: $name"
[[ ! -e "/etc/pve/lxc/${vmid}.conf" && ! -e "/etc/pve/qemu-server/${vmid}.conf" ]] || die "VMID $vmid is already in use"
grep -qE "^[^:]+:[[:space:]]${storage}$" /etc/pve/storage.cfg || die "storage is not configured: $storage"
ip link show "$bridge" >/dev/null 2>&1 || die "bridge is not present: $bridge"

template_ref="$(pveam list "$template_storage" | awk -v major="$debian_major" '$1 ~ ("debian-" major "-standard_.*_amd64\\.tar") { print $1 }' | sort -V | tail -n 1)"
[[ -n "$template_ref" ]] || die "no Debian $debian_major amd64 template on $template_storage"
[[ "$template_ref" == *:* ]] || template_ref="${template_storage}:${template_ref}"

storage_row="$(pvesm status | awk -v storage="$storage" '$1 == storage { print }')"
[[ -n "$storage_row" ]] || die "storage is not active: $storage"
storage_type="$(awk '{ print $2 }' <<< "$storage_row")"
available_kib="$(awk '{ print $6 }' <<< "$storage_row")"
[[ "$available_kib" =~ ^[0-9]+$ ]] || die "could not read free space for $storage"
min_free_kib=$((120 * 1024 * 1024))
(( available_kib >= min_free_kib )) || die "$storage has less than 120 GiB free; refusing an 80 GiB CI rootfs"

case "$storage_type" in
  dir|nfs|cifs|cephfs)
    rootfs_volume="${storage}:${vmid}/vm-${vmid}-disk-0.raw,size=${rootfs_size}"
    allocated_volume="${storage}:${vmid}/vm-${vmid}-disk-0.raw"
    ;;
  *)
    rootfs_volume="${storage}:${rootfs_size}"
    allocated_volume=""
    ;;
esac

cleanup_orphan() {
  if [[ "${mount_active:-false}" == true ]]; then
    umount "$mountpoint" >/dev/null 2>&1 || true
    rmdir "$mountpoint" >/dev/null 2>&1 || true
  fi
  if [[ -n "$allocated_volume" && ! -e "/etc/pve/lxc/${vmid}.conf" ]]; then
    pvesm free "$allocated_volume" >/dev/null 2>&1 || true
  fi
}
trap cleanup_orphan EXIT
if [[ -n "$allocated_volume" ]]; then
  pvesm alloc "$storage" "$vmid" "vm-${vmid}-disk-0.raw" "$rootfs_size" >/dev/null
  rootfs_path="$(pvesm path "$allocated_volume")"
  mkfs.ext4 -F "$rootfs_path" >/dev/null
  container_root_uid="$(awk -F: '$1 == "root" { print $2; exit }' /etc/subuid)"
  container_root_gid="$(awk -F: '$1 == "root" { print $2; exit }' /etc/subgid)"
  [[ "$container_root_uid" =~ ^[0-9]+$ && "$container_root_gid" =~ ^[0-9]+$ ]] || die "could not determine the unprivileged root mapping"
  mountpoint="$(mktemp -d /run/ci-runner-rootfs.XXXXXX)"
  mount -o loop "$rootfs_path" "$mountpoint"
  mount_active=true
  chown "$container_root_uid:$container_root_gid" "$mountpoint"
  umount "$mountpoint"
  mount_active=false
  rmdir "$mountpoint"
fi

echo "Creating VMID $vmid ($name) on $node"
echo "template=$template_ref storage=$storage ($storage_type) bridge=$bridge cores=$cores memory=${memory_mb}MiB swap=${swap_mb}MiB rootfs=$rootfs_size timezone=$timezone"

pct create "$vmid" "$template_ref" \
  --hostname "$name" \
  --ostype debian \
  --unprivileged 1 \
  --cores "$cores" \
  --memory "$memory_mb" \
  --swap "$swap_mb" \
  --rootfs "$rootfs_volume" \
  --net0 "name=eth0,bridge=${bridge},ip=dhcp,ip6=auto,firewall=1,type=veth" \
  --features "nesting=1,keyctl=1" \
  --timezone "$timezone" \
  --onboot 1 \
  --startup "order=40,up=5,down=120" \
  --tags "ci;github-actions;self-hosted"
trap - EXIT

cat > "/etc/pve/firewall/${vmid}.fw" <<'EOF'
[OPTIONS]
enable: 1
policy_in: DROP
policy_out: ACCEPT
dhcp: 1
log_level_in: nolog
log_level_out: nolog

[RULES]
IN ACCEPT -source 192.168.1.0/24 -p icmp
EOF

pct start "$vmid"
for _ in {1..60}; do
  [[ "$(pct status "$vmid" | awk '{print $2}')" == running ]] && break
  sleep 2
done
[[ "$(pct status "$vmid" | awk '{print $2}')" == running ]] || die "LXC $vmid did not reach running state"

echo "LXC booted"
pct status "$vmid"
pct config "$vmid" | grep -E '^(hostname|cores|memory|swap|rootfs|net0|features|unprivileged|onboot|startup|ostype|tags):'
