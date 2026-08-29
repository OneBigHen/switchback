#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="docker-stable"
EXPECTED_IP="192.168.1.175"
EXPECTED_FINGERPRINT="SHA256:ypMa80Hpp0hGt6wuih6QCZ0Ru49CehlEGYnbSOOuREI"
IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"
EXPECTED_IMAGE_ID="sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48"
MODE=sync
if [[ $# -gt 0 ]]; then MODE=$1; fi

die() { echo "offload-mobile-qa: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  scripts/qa/offload-mobile-qa.sh sync
  scripts/qa/offload-mobile-qa.sh run RUN_ID -- 'command in /workspace'
  scripts/qa/offload-mobile-qa.sh self-test

SIGKILL recovery: the next run reclaims only a dead exact command-lock owner.
EOF
}

reject_ambient() {
  local name value
  for name in DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH \
    HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
    value="$(printenv "$name" 2>/dev/null || true)"
    [[ -z "$value" ]] || die "ambient $name is set; refusing unsafe routing"
  done
}

resolve_target() {
  local hostname user port proxycommand proxyjump fingerprint
  hostname="$(ssh -G "$TARGET" 2>/dev/null | awk '$1 == "hostname" { print $2; exit }')"
  user="$(ssh -G "$TARGET" 2>/dev/null | awk '$1 == "user" { print $2; exit }')"
  port="$(ssh -G "$TARGET" 2>/dev/null | awk '$1 == "port" { print $2; exit }')"
  proxycommand="$(ssh -G "$TARGET" 2>/dev/null | awk '$1 == "proxycommand" { print substr($0, index($0,$2)); exit }')"
  proxyjump="$(ssh -G "$TARGET" 2>/dev/null | awk '$1 == "proxyjump" { print $2; exit }')"
  proxycommand="${proxycommand:-none}"
  proxyjump="${proxyjump:-none}"
  [[ "$TARGET" == docker-stable && "$hostname" == "$EXPECTED_IP" && "$user" == root && "$port" == 22 ]] || die "unexpected SSH routing"
  [[ "$proxycommand" == none && "$proxyjump" == none ]] || die "SSH proxy routing is not allowed"
  fingerprint="$(ssh-keyscan -T 5 -t ed25519 "$hostname" 2>/dev/null | ssh-keygen -lf - -E sha256 | awk 'NR == 1 { print $2 }')"
  [[ "$fingerprint" == "$EXPECTED_FINGERPRINT" ]] || die "SSH host fingerprint mismatch"
  printf 'target=%s hostname=%s user=%s fingerprint=%s\n' "$TARGET" "$hostname" "$user" "$fingerprint"
}

remote() {
  local command
  printf -v command '%q ' "$@"
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 "$TARGET" \
    "env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy DOCKER_HOST=unix:///var/run/docker.sock DOCKER_CONTEXT=default $command"
}

set_names() {
  REMOTE_ROOT="/var/tmp/switchback-offload-$RUN_ID"
  REMOTE_SOURCE="$REMOTE_ROOT/source"
  CONTAINER="switchback-offload-$RUN_ID"
  INSTALL_NETWORK="switchback-offload-install-$RUN_ID"
  TEST_NETWORK="switchback-offload-test-$RUN_ID"
  LOCAL_ROOT="$ROOT/artifacts/mobile-qa/offload/$RUN_ID"
  SNAPSHOT_ROOT="$LOCAL_ROOT/source-snapshot"
  LOCAL_LOG_ROOT="$LOCAL_ROOT/logs"
}

assert_fresh_destination() {
  local directory
  for directory in "$ROOT/artifacts" "$ROOT/artifacts/mobile-qa" "$ROOT/artifacts/mobile-qa/offload"; do
    [[ ! -L "$directory" ]] || die "artifact parent is a symlink"
  done
  [[ ! -e "$LOCAL_ROOT" && ! -L "$LOCAL_ROOT" ]] || die "local run destination already exists"
  mkdir -p "$LOCAL_ROOT" "$LOCAL_LOG_ROOT"
}

write_local_metadata() {
  MANIFEST_HASH="$(sha256sum "$LOCAL_ROOT/source.sha256" | awk '{ print $1 }')"
  [[ "$MANIFEST_HASH" =~ ^[0-9a-f]{64}$ ]] || die "invalid manifest hash"
  printf 'run_id=%s\nremote_root=%s\nremote_source=%s\ncontainer=%s\ninstall_network=%s\ntest_network=%s\nowner_token=%s\nmanifest_hash=%s\nimage_id=%s\n' \
    "$RUN_ID" "$REMOTE_ROOT" "$REMOTE_SOURCE" "$CONTAINER" "$INSTALL_NETWORK" "$TEST_NETWORK" \
    "$OWNER_TOKEN" "$MANIFEST_HASH" "$EXPECTED_IMAGE_ID" > "$LOCAL_ROOT/ownership.env"
}

read_local_metadata() {
  local metadata="$LOCAL_ROOT/ownership.env" key value
  local META_RUN_ID= META_REMOTE_ROOT= META_REMOTE_SOURCE= META_CONTAINER=
  local META_INSTALL_NETWORK= META_TEST_NETWORK= META_OWNER_TOKEN= META_MANIFEST_HASH= META_IMAGE_ID=
  [[ -f "$metadata" && ! -L "$metadata" ]] || die "ownership metadata is missing"
  while IFS='=' read -r key value; do
    case "$key" in
      run_id) META_RUN_ID=$value ;; remote_root) META_REMOTE_ROOT=$value ;;
      remote_source) META_REMOTE_SOURCE=$value ;; container) META_CONTAINER=$value ;;
      install_network) META_INSTALL_NETWORK=$value ;; test_network) META_TEST_NETWORK=$value ;;
      owner_token) META_OWNER_TOKEN=$value ;; manifest_hash) META_MANIFEST_HASH=$value ;;
      image_id) META_IMAGE_ID=$value ;; '') ;; *) die "unknown metadata field" ;;
    esac
  done < "$metadata"
  [[ "$META_RUN_ID" == "$RUN_ID" && "$META_REMOTE_ROOT" == "$REMOTE_ROOT" && "$META_REMOTE_SOURCE" == "$REMOTE_SOURCE" ]] || die "ownership path mismatch"
  [[ "$META_CONTAINER" == "$CONTAINER" && "$META_INSTALL_NETWORK" == "$INSTALL_NETWORK" && "$META_TEST_NETWORK" == "$TEST_NETWORK" ]] || die "ownership resource mismatch"
  [[ "$META_OWNER_TOKEN" =~ ^[0-9a-f]{64}$ && "$META_IMAGE_ID" == "$EXPECTED_IMAGE_ID" ]] || die "ownership metadata invalid"
  [[ -f "$LOCAL_ROOT/source.sha256" && ! -L "$LOCAL_ROOT/source.sha256" ]] || die "local manifest is missing"
  [[ "$(sha256sum "$LOCAL_ROOT/source.sha256" | awk '{ print $1 }')" == "$META_MANIFEST_HASH" ]] || die "local manifest hash changed"
  OWNER_TOKEN=$META_OWNER_TOKEN
  MANIFEST_HASH=$META_MANIFEST_HASH
}

remote_preflight() {
  remote sh -s <<EOF
set -eu
test ! -e '$REMOTE_ROOT'
test ! -L '$REMOTE_ROOT'
for resource in '$CONTAINER' '$INSTALL_NETWORK' '$TEST_NETWORK'; do
  if docker inspect "\$resource" >/dev/null 2>&1; then exit 1; fi
  if docker network inspect "\$resource" >/dev/null 2>&1; then exit 1; fi
done
test "\$DOCKER_HOST" = unix:///var/run/docker.sock
test "\$DOCKER_CONTEXT" = default
test "\$(docker context show)" = default
test "\$(docker context inspect default --format '{{(index .Endpoints "docker").Host}}')" = unix:///var/run/docker.sock
image_id="\$(docker image inspect '$IMAGE' --format '{{.Id}}')"
test "\$image_id" = '$EXPECTED_IMAGE_ID'
cpus="\$(nproc)"; mem_mib="\$(awk '/MemTotal:/ { print int(\$2 / 1024) }' /proc/meminfo)"
available_mib="\$(awk '/MemAvailable:/ { print int(\$2 / 1024) }' /proc/meminfo)"
free_mib="\$(df --output=avail -m /var/tmp | tail -1 | tr -d ' ')"
test "\$cpus" -ge 2; test "\$mem_mib" -ge 6144; test "\$available_mib" -ge 6144; test "\$free_mib" -ge 6144
mkdir -m 700 '$REMOTE_ROOT' '$REMOTE_ROOT/logs'
printf '%s\\n' '$OWNER_TOKEN' > '$REMOTE_ROOT/owner-token'
chmod 600 '$REMOTE_ROOT/owner-token'
printf '%s\\n' '$RUN_ID' > '$REMOTE_ROOT/run-id'
exec > '$REMOTE_ROOT/logs/preflight.log' 2>&1
printf 'hostname=%s\\nuid=%s\\ndocker_server=%s\\nimage_id=%s\\n' "\$(hostname)" "\$(id -u)" "\$(docker version --format '{{.Server.Version}}')" "\$image_id"
printf 'cpus=%s\\nmem_total_mib=%s\\nmem_available_mib=%s\\n' "\$cpus" "\$mem_mib" "\$available_mib"
df -h /var/tmp
cat /proc/pressure/io 2>/dev/null | head -3 || true
printf 'capacity_gate=PASS cpus=%s mem_total_mib=%s mem_available_mib=%s free_var_tmp_mib=%s\\n' "\$cpus" "\$mem_mib" "\$available_mib" "\$free_mib"
EOF
  remote cat "$REMOTE_ROOT/logs/preflight.log" > "$LOCAL_LOG_ROOT/preflight.txt"
  cat "$LOCAL_LOG_ROOT/preflight.txt"
}

build_allowlist() {
  local list="$LOCAL_ROOT/allowlist.txt" nul="$LOCAL_ROOT/allowlist.nul"
  {
    for directory in src tests scripts public; do
      [[ -d "$ROOT/$directory" ]] || continue
      find "$ROOT/$directory" -type f \
        ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.next/*' \
        ! -path '*/artifacts/*' ! -path '*/.omo/*' ! -path '*/data/*' \
        ! -path '*/logs/*' ! -path '*/archives/*' ! -path '*/archive*/*' \
        ! -path '*/secret/*' ! -path '*/secrets/*' ! -path '*/credential/*' \
        ! -path '*/credentials/*' ! -path '*/private/*' ! -path '*/tokens/*' ! -path '*/auth/*' \
        ! -name '.env' ! -name '.env.*' ! -iname '*secret*' ! -iname '*credential*' \
        ! -iname '*password*' ! -iname '*token*' ! -iname '*private*' \
        ! -iname '*.pem' ! -iname '*.key' ! -iname '*.log' ! -iname '*.zip' \
        ! -iname '*.tar' ! -iname '*.tgz' ! -iname '*.gz' ! -iname '*.bz2' \
        ! -iname '*.xz' ! -iname '*.pbf' ! -iname '*.db' ! -iname '*.sqlite' ! -iname '*.sqlite-*' \
        -printf "$directory/%P\n"
    done
    for pattern in package.json package-lock.json next.config.* next-env.d.ts tsconfig*.json \
      eslint.config.* postcss.config.* playwright*.ts playwright*.mjs vitest.config.* \
      src/app/styles/a11y-tokens.ts; do
      for path in "$ROOT"/$pattern; do
        [[ -f "$path" ]] || continue
        printf '%s\n' "$(printf '%s' "$path" | sed "s#^$ROOT/##")"
      done
    done
  } | LC_ALL=C sort -u > "$list"
  [[ -s "$list" ]] || die "allowlist is empty"
  if LC_ALL=C awk '$0 != "src/app/styles/a11y-tokens.ts" && (tolower($0) ~ /(^|\/)(\.env|\.git|node_modules|\.next|artifacts|\.omo|data|logs|archives?|secrets?|credentials?|private|tokens?|auth)(\/|$)/ || tolower($0) ~ /(^|\/)[^\/]*(secret|credential|password|token|private)[^\/]*$/ || tolower($0) ~ /\.(pem|key|log|zip|tar|tgz|gz|bz2|xz|pbf|db|sqlite)(-|$)/) { exit 1 }' "$list"; then :; else die "allowlist contains prohibited path"; fi
  if LC_ALL=C grep -n '[[:cntrl:]]' "$list" >/dev/null; then die "allowlist contains control characters"; fi
  tr '\n' '\0' < "$list" > "$nul"
  mkdir -p "$SNAPSHOT_ROOT"
  (cd "$ROOT" && tar --null --verbatim-files-from --files-from="$nul" -cpf -) | tar --null --extract --preserve-permissions --file=- --directory="$SNAPSHOT_ROOT"
  (cd "$SNAPSHOT_ROOT" && while IFS= read -r path; do sha256sum -- "$path"; done < "$list") > "$LOCAL_ROOT/source.sha256"
  write_local_metadata
  printf 'allowlist_files=%s\n' "$(wc -l < "$list")" | tee "$LOCAL_ROOT/allowlist-count.txt"
}

prepare_remote_source() {
  remote sh -s <<EOF
set -eu
test -f '$REMOTE_ROOT/owner-token'
test "\$(cat '$REMOTE_ROOT/owner-token')" = '$OWNER_TOKEN'
test "\$(cat '$REMOTE_ROOT/run-id')" = '$RUN_ID'
test ! -e '$REMOTE_SOURCE'
test ! -L '$REMOTE_SOURCE'
mkdir -p '$REMOTE_SOURCE'
EOF
  (cd "$SNAPSHOT_ROOT" && tar --null --verbatim-files-from --files-from="$LOCAL_ROOT/allowlist.nul" -cpf -) | remote tar --null --extract --preserve-permissions --file=- --directory="$REMOTE_SOURCE"
}

verify_source() {
  remote tee "$REMOTE_ROOT/source.sha256" < "$LOCAL_ROOT/source.sha256" > /dev/null
  remote sh -s > "$LOCAL_LOG_ROOT/remote-manifest-check.txt" <<EOF
set -eu
cd '$REMOTE_SOURCE'
sha256sum -c '$REMOTE_ROOT/source.sha256'
find . -type f -printf '%P\\n' | LC_ALL=C sort > '$REMOTE_ROOT/remote-allowlist.txt'
EOF
  cat "$LOCAL_LOG_ROOT/remote-manifest-check.txt"
  remote cat "$REMOTE_ROOT/remote-allowlist.txt" > "$LOCAL_ROOT/remote-allowlist.txt"
  remote cat "$REMOTE_ROOT/source.sha256" > "$LOCAL_ROOT/remote-source.sha256"
  cmp -s "$LOCAL_ROOT/allowlist.txt" "$LOCAL_ROOT/remote-allowlist.txt" || die "remote file set differs"
  cmp -s "$LOCAL_ROOT/source.sha256" "$LOCAL_ROOT/remote-source.sha256" || die "remote manifest differs"
  printf 'source_manifest=PASS files=%s\n' "$(wc -l < "$LOCAL_ROOT/allowlist.txt")" | tee "$LOCAL_ROOT/source-integrity.txt"
}

prepare_remote_artifacts() {
  remote mkdir -p "$REMOTE_SOURCE/artifacts/mobile-qa"
}

create_container() {
  remote sh -s > "$LOCAL_LOG_ROOT/container-create.txt" <<EOF
set -eu
docker network create --driver bridge --label com.switchback.offload.owner='$OWNER_TOKEN' --label com.switchback.offload.run-id='$RUN_ID' '$INSTALL_NETWORK'
docker network create --internal --driver bridge --label com.switchback.offload.owner='$OWNER_TOKEN' --label com.switchback.offload.run-id='$RUN_ID' '$TEST_NETWORK'
docker create --name '$CONTAINER' --hostname '$CONTAINER' \
  --label com.switchback.offload.owner='$OWNER_TOKEN' --label com.switchback.offload.run-id='$RUN_ID' \
  --label com.switchback.offload.manifest='$MANIFEST_HASH' --label com.switchback.offload.image='$EXPECTED_IMAGE_ID' \
  --init --cpus=2 --memory=4g --memory-swap=4g --pids-limit=512 --cap-drop=ALL \
  --security-opt=no-new-privileges --shm-size=1g --network '$INSTALL_NETWORK' \
  --mount "type=bind,src=$REMOTE_SOURCE,dst=/workspace" --workdir /workspace '$IMAGE' sleep infinity
docker start '$CONTAINER'
EOF
  cat "$LOCAL_LOG_ROOT/container-create.txt"
}

verify_container_state() {
  local expected_network="$1" expected_internal="$2"
  remote bash -s > "$LOCAL_LOG_ROOT/state-$expected_network.txt" <<EOF
set -eu
trap 'printf "state_check_failed_line=%s\\n" "\$LINENO"' ERR
printf 'observed_image=%s observed_status=%s observed_mode=%s observed_networks=%s\\n' "\$(docker inspect '$CONTAINER' --format '{{.Image}}')" "\$(docker inspect '$CONTAINER' --format '{{.State.Status}}')" "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.NetworkMode}}')" "\$(docker inspect '$CONTAINER' --format '{{range \$name, \$value := .NetworkSettings.Networks}}{{println \$name}}{{end}}' | tr '\\\\n' ',')"
printf 'observed_caps=%s observed_sec=%s observed_memory=%s observed_swap=%s observed_pids=%s observed_shm=%s observed_ports=%s observed_mounts=%s observed_binds=%s observed_volumes_from=%s\\n' "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.CapDrop}}')" "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.SecurityOpt}}')" "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.Memory}}')" "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.MemorySwap}}')" "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.PidsLimit}}')" "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.ShmSize}}')" "\$(docker inspect '$CONTAINER' --format '{{len .HostConfig.PortBindings}}')" "\$(docker inspect '$CONTAINER' --format '{{len .Mounts}}')" "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.Binds}}')" "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.VolumesFrom}}')"
printf 'observed_init=%s\\n' "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.Init}}')"
printf 'observed_internal=%s observed_network_containers=%s\\n' "\$(docker network inspect '$expected_network' --format '{{.Internal}}')" "\$(docker network inspect '$expected_network' --format '{{len .Containers}}')"
test "\$(docker image inspect '$IMAGE' --format '{{.Id}}')" = '$EXPECTED_IMAGE_ID'
test "\$(docker inspect '$CONTAINER' --format '{{.Image}}')" = '$EXPECTED_IMAGE_ID'
test "\$(docker inspect '$CONTAINER' --format '{{.State.Status}}')" = running
test "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.Init}}')" = true
test "\$(docker inspect '$CONTAINER' --format '{{index .Config.Labels "com.switchback.offload.owner"}}')" = '$OWNER_TOKEN'
test "\$(docker inspect '$CONTAINER' --format '{{index .Config.Labels "com.switchback.offload.run-id"}}')" = '$RUN_ID'
test "\$(docker inspect '$CONTAINER' --format '{{index .Config.Labels "com.switchback.offload.manifest"}}')" = '$MANIFEST_HASH'
test "\$(docker inspect '$CONTAINER' --format '{{index .Config.Labels "com.switchback.offload.image"}}')" = '$EXPECTED_IMAGE_ID'
nano_cpus="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.NanoCpus}}' | tr -d '\\r\\n')"
memory_limit="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.Memory}}' | tr -d '\\r\\n')"
[[ "\$nano_cpus" == 2000000000 && "\$memory_limit" == 4294967296 ]]
memory_swap="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.MemorySwap}}' | tr -d '\\r\\n')"
[[ "\$memory_swap" == 4294967296 ]]
pid_limit="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.PidsLimit}}' | tr -d '\\r\\n')"
shm_size="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.ShmSize}}' | tr -d '\\r\\n')"
[[ "\$pid_limit" == 512 && "\$shm_size" == 1073741824 ]]
test "\$(docker inspect '$CONTAINER' --format '{{.HostConfig.Privileged}}')" = false
test "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.CapDrop}}')" = '["ALL"]'
test "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.SecurityOpt}}')" = '["no-new-privileges"]'
test "\$(docker inspect '$CONTAINER' --format '{{len .HostConfig.Devices}}')" = 0
test "\$(docker inspect '$CONTAINER' --format '{{len .HostConfig.PortBindings}}')" = 0
test "\$(docker inspect '$CONTAINER' --format '{{len .Mounts}}')" = 1
mount_line="\$(docker inspect '$CONTAINER' --format '{{range .Mounts}}{{printf "%s|%s|%s|%t\\n" .Type .Source .Destination .RW}}{{end}}')"
test "\$mount_line" = 'bind|$REMOTE_SOURCE|/workspace|true'
network_names="\$(docker inspect '$CONTAINER' --format '{{range \$name, \$value := .NetworkSettings.Networks}}{{println \$name}}{{end}}')"
network_count="\$(printf '%s\\n' "\$network_names" | awk 'NF { n++ } END { print n + 0 }')"
test "\$network_count" = 1
test "\$network_names" = '$expected_network'
test "\$(docker network inspect '$expected_network' --format '{{.Internal}}')" = '$expected_internal'
test "\$(docker network inspect '$expected_network' --format '{{index .Labels "com.switchback.offload.owner"}}')" = '$OWNER_TOKEN'
test "\$(docker network inspect '$expected_network' --format '{{index .Labels "com.switchback.offload.run-id"}}')" = '$RUN_ID'
network_container_names="\$(docker network inspect '$expected_network' --format '{{range .Containers}}{{println .Name}}{{end}}')"
test "\$network_container_names" = '$CONTAINER'
test "\$(docker network inspect '$expected_network' --format '{{len .Containers}}')" = 1
network_mode="\$(docker inspect '$CONTAINER' --format '{{.HostConfig.NetworkMode}}' | tr -d '\\r\\n')"
[[ "\$network_mode" == '$INSTALL_NETWORK' ]]
test "\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.Binds}}')" = null
volumes_from="\$(docker inspect '$CONTAINER' --format '{{json .HostConfig.VolumesFrom}}')"
test "\$volumes_from" = null || test "\$volumes_from" = '[]'
if test '$expected_network' = '$TEST_NETWORK' && docker network inspect '$INSTALL_NETWORK' >/dev/null 2>&1; then test "\$(docker network inspect '$INSTALL_NETWORK' --format '{{len .Containers}}')" = 0; fi
printf 'container_state=PASS network=%s memory_limit=4GiB memory_swap_additional=0\\n' '$expected_network'
EOF
  cat "$LOCAL_LOG_ROOT/state-$expected_network.txt"
}

run_install() {
  local output="$LOCAL_LOG_ROOT/npm-ci.log"
  set +e
  remote sh -s > "$output" <<EOF
set +e
docker exec '$CONTAINER' sh -lc 'cd /workspace && npm ci --no-audit --no-fund' > '$REMOTE_ROOT/logs/npm-ci.log' 2>&1
rc=\$?
printf 'npm_ci_exit=%s\\n' "\$rc" >> '$REMOTE_ROOT/logs/npm-ci.log'
cat '$REMOTE_ROOT/logs/npm-ci.log'
exit "\$rc"
EOF
  local rc=$?
  set -e
  cat "$output"
  return "$rc"
}

move_to_internal_network() {
  remote sh -s > "$LOCAL_LOG_ROOT/network-transition.txt" <<EOF
set -eu
docker network disconnect -f '$INSTALL_NETWORK' '$CONTAINER'
docker network connect '$TEST_NETWORK' '$CONTAINER'
test "\$(docker network inspect '$TEST_NETWORK' --format '{{.Internal}}')" = true
names="\$(docker inspect '$CONTAINER' --format '{{range \$name, \$value := .NetworkSettings.Networks}}{{println \$name}}{{end}}')"
test "\$(printf '%s\\n' "\$names" | awk 'NF { n++ } END { print n + 0 }')" = 1
test "\$names" = '$TEST_NETWORK'
test "\$(docker network inspect '$INSTALL_NETWORK' --format '{{len .Containers}}')" = 0
printf 'transition=PASS exclusive_internal_network=%s\\n' '$TEST_NETWORK'
EOF
  cat "$LOCAL_LOG_ROOT/network-transition.txt"
}

run_baselines() {
  local commands_file="$LOCAL_ROOT/baseline-commands.txt"
  cat > "$commands_file" <<'EOF'
unit-mobile-qa|||npx vitest run tests/unit/mobile-qa-artifacts.test.ts tests/unit/mobile-qa-devices.test.ts tests/unit/mobile-qa-reporter.test.ts tests/unit/mobile-qa-runtime.test.ts tests/unit/mobile-qa-scroll.test.ts
typecheck|||npm run typecheck
lint|||npm run lint
playwright-fast-list|50|5|npx playwright test --config=playwright.mobile.config.ts --project=webkit-standard --project=chromium-standard --list
playwright-prepare-list|7|1|npx playwright test --config=playwright.mobile.config.ts --project=webkit-prepare --list
playwright-full-list|110|7|npx playwright test --config=playwright.mobile.config.ts --project=webkit-small --project=webkit-standard --project=webkit-large --project=webkit-standard-landscape --project=chromium-standard --list
EOF
  local all_rc=0 name expected_tests expected_files command rc count_rc
  while IFS='|' read -r name expected_tests expected_files command; do
    echo "--- $name ---" | tee -a "$LOCAL_LOG_ROOT/baselines.log"
    set +e
    remote sh -s > "$LOCAL_LOG_ROOT/$name.log" <<EOF
set +e
docker exec '$CONTAINER' sh -lc 'cd /workspace && $command' > '$REMOTE_ROOT/logs/$name.log' 2>&1
rc=\$?
printf '%s_exit=%s\\n' '$name' "\$rc" >> '$REMOTE_ROOT/logs/$name.log'
cat '$REMOTE_ROOT/logs/$name.log'
exit "\$rc"
EOF
    rc=$?
    set -e
    cat "$LOCAL_LOG_ROOT/$name.log" | tee -a "$LOCAL_LOG_ROOT/baselines.log"
    printf '%s_exit=%s\n' "$name" "$rc" | tee -a "$LOCAL_ROOT/baseline-exit-codes.txt"
    (( rc == 0 )) || all_rc=1
    if [[ -n "$expected_tests" ]]; then
      set +e
      remote sh -s > "$LOCAL_LOG_ROOT/$name.count" <<EOF
set -eu
line="\$(awk '\$1 == "Total:" && \$3 == "tests" { print \$0 }' '$REMOTE_ROOT/logs/$name.log' | tail -1)"
actual_tests="\$(printf '%s\\n' "\$line" | awk '{ print \$2 }')"
actual_files="\$(printf '%s\\n' "\$line" | awk '{ print \$5 }')"
test "\$actual_tests" = '$expected_tests'
test "\$actual_files" = '$expected_files'
printf '%s_count_tests=%s_count_files=%s\\n' '$name' "\$actual_tests" "\$actual_files" >> '$REMOTE_ROOT/logs/$name.log'
printf '%s tests=%s files=%s\\n' '$name' "\$actual_tests" "\$actual_files"
EOF
      count_rc=$?
      set -e
      cat "$LOCAL_LOG_ROOT/$name.count"
      (( count_rc == 0 )) || all_rc=1
    fi
  done < "$commands_file"
  return "$all_rc"
}

write_summary() {
  local baseline_rc="$1"
  remote sh -s > "$LOCAL_LOG_ROOT/summary-write.txt" <<EOF
set -eu
printf 'run_id=%s\\nmanifest_hash=%s\\nimage_id=%s\\n' '$RUN_ID' '$MANIFEST_HASH' '$EXPECTED_IMAGE_ID' > '$REMOTE_ROOT/summary.txt'
printf 'unit-mobile-qa_exit=%s\\ntypecheck_exit=%s\\nlint_exit=%s\\n' "\$(sed -n 's/^unit-mobile-qa_exit=//p' '$REMOTE_ROOT/logs/unit-mobile-qa.log' | tail -1)" "\$(sed -n 's/^typecheck_exit=//p' '$REMOTE_ROOT/logs/typecheck.log' | tail -1)" "\$(sed -n 's/^lint_exit=//p' '$REMOTE_ROOT/logs/lint.log' | tail -1)" >> '$REMOTE_ROOT/summary.txt'
printf 'playwright_fast_tests=50\\nplaywright_fast_files=5\\nplaywright_prepare_tests=7\\nplaywright_prepare_files=1\\nplaywright_full_tests=110\\nplaywright_full_files=7\\nbaseline_exit=%s\\n' '$baseline_rc' >> '$REMOTE_ROOT/summary.txt'
cat '$REMOTE_ROOT/summary.txt'
EOF
  cat "$LOCAL_LOG_ROOT/summary-write.txt"
}

verify_retained_source() {
  local phase="$1"
  remote bash -s <<EOF
set -eu
exec >> '$REMOTE_ROOT/logs/retained-source-$phase.log' 2>&1
cd '$REMOTE_SOURCE'
test "\$(sha256sum '$REMOTE_ROOT/source.sha256' | awk '{ print \$1 }')" = '$MANIFEST_HASH'
sha256sum -c '$REMOTE_ROOT/source.sha256' >/dev/null
printf 'retained_source_integrity=PASS phase=%s manifest_hash=%s\\n' '$phase' '$MANIFEST_HASH'
EOF
  remote cat "$REMOTE_ROOT/logs/retained-source-$phase.log" > "$LOCAL_LOG_ROOT/retained-source-$phase.txt"
  cat "$LOCAL_LOG_ROOT/retained-source-$phase.txt"
}

command_lifecycle_script() {
  cat <<'EOF'
set -eu
mode=${1:-}
token=${2:-}

live_token_pids() {
  for env_file in /proc/[0-9]*/environ; do
    pid=${env_file#/proc/}; pid=${pid%/environ}
    [ "$pid" != "$$" ] || continue
    [ -r "$env_file" ] || continue
    # Clear the token only for the inspector so its own process cannot match;
    # do not exempt arbitrary process names from ownership checks.
    if SWITCHBACK_OFFLOAD_COMMAND_TOKEN= grep -zFqx "SWITCHBACK_OFFLOAD_COMMAND_TOKEN=$token" "$env_file" 2>/dev/null; then
      printf '%s\n' "$pid"
    fi
  done
}

live_pids() {
  for proc_dir in /proc/[0-9]*; do
    pid=${proc_dir#/proc/}
    [ "$pid" != "1" ] && [ "$pid" != "$$" ] || continue
    [ -r "$proc_dir/stat" ] || continue
    IFS=' ' read -r stat_pid comm state rest < "$proc_dir/stat" || continue
    case "$state" in Z*) continue ;; esac
    printf '%s\n' "$pid"
  done
}

new_live_pids() {
  baseline=$1
  current="$baseline.current"
  live_pids > "$current"
  while IFS= read -r pid; do
    grep -Fqx "$pid" "$baseline" || printf '%s\n' "$pid"
  done < "$current"
  rm -f "$current"
}

session_pids() {
  session=$1
  [ -n "$session" ] || return 0
  for proc_dir in /proc/[0-9]*; do
    pid=${proc_dir#/proc/}
    [ "$pid" != "1" ] && [ "$pid" != "$$" ] || continue
    [ -r "$proc_dir/stat" ] || continue
    IFS=' ' read -r stat_pid comm state rest < "$proc_dir/stat" || continue
    case "$state" in Z*) continue ;; esac
    set -- $rest
    [ "${3:-}" = "$session" ] || continue
    printf '%s\n' "$pid"
  done
}

unexpected_live_pids() {
  snapshot=; line=; pid=; ppid=; state=; age=; comm=; command=; init=0; idle_sleep=0
  valid_pid() {
    case "$1" in ''|*[!0-9]*) return 1 ;; esac
    [ "$1" -gt 0 ] 2>/dev/null
  }
  valid_ppid() {
    case "$1" in ''|*[!0-9]*) return 1 ;; esac
    [ "$1" -ge 0 ] 2>/dev/null
  }
  valid_age() {
    case "$1" in ''|*[!0-9]*) return 1 ;; esac
    # procps exposes this field as an unsigned 32-bit elapsed-seconds value
    # in the retained container; reject values that overflow that field.
    [ "$1" -le 4294967295 ] 2>/dev/null
  }
  snapshot="$(ps -eo pid=,ppid=,stat=,etimes=,comm=,args=)"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    set -- $line
    pid=${1:-}; ppid=${2:-}; state=${3:-}; age=${4:-}; comm=${5:-}
    shift 5 || true
    command="$*"
    if ! valid_pid "$pid" || ! valid_ppid "$ppid"; then
      printf 'malformed process identity: %s\n' "$line"
      continue
    fi
    [ "$pid" = "$$" ] && continue
    if [ "$pid" = 1 ]; then
      if [ "$ppid" = 0 ] && [ "${state#Z}" = "$state" ] && [ "$comm" = docker-init ] \
        && [ "$command" = "/sbin/docker-init -- sleep infinity" ] \
        && valid_age "$age"; then
        init=1
      else
        printf 'unexpected init topology: %s\n' "$line"
      fi
      continue
    fi
    case "$state" in
      Z*)
        printf 'unexpected zombie: %s\n' "$line"
        continue
        ;;
    esac
    if [ "$comm" = ps ] && [ "$ppid" = "$$" ] \
      && [ "$command" = "ps -eo pid=,ppid=,stat=,etimes=,comm=,args=" ] \
      && valid_age "$age"; then
      continue
    fi
    if [ "$ppid" = 1 ] && [ "$comm" = sleep ] && [ "$command" = "sleep infinity" ] \
      && valid_age "$age"; then
      idle_sleep=$((idle_sleep + 1))
      continue
    fi
    printf '%s\n' "$line"
  done <<EOF_SNAPSHOT
$snapshot
EOF_SNAPSHOT
  [ "$init" -eq 1 ] || printf 'missing validated docker-init PID 1\n'
  [ "$idle_sleep" -eq 1 ] || printf 'expected exactly one direct sleep infinity child, found %s\n' "$idle_sleep"
}

assert_no_listeners() {
  for sockets in /proc/net/tcp /proc/net/tcp6; do
    [ -r "$sockets" ] || continue
    awk 'NR > 1 && $4 == "0A" { found = 1 } END { exit found ? 1 : 0 }' "$sockets"
  done
}

cleanup_token_processes() {
  baseline=${1:-/dev/null}
  session=${2:-}
  current="/tmp/switchback-offload-command-current-$$"
  if [ -f "$baseline" ]; then new_live_pids "$baseline" > "$current"; else live_token_pids > "$current"; fi
  session_pids "$session" >> "$current"
  while IFS= read -r pid; do kill -TERM "$pid" 2>/dev/null || true; done < "$current"
  if [ -f "$baseline" ]; then new_live_pids "$baseline" > "$current"; else live_token_pids > "$current"; fi
  session_pids "$session" >> "$current"
  while IFS= read -r pid; do kill -KILL "$pid" 2>/dev/null || true; done < "$current"
  if [ -f "$baseline" ]; then new_live_pids "$baseline" > "$current"; else live_token_pids > "$current"; fi
  session_pids "$session" >> "$current"
  [ ! -s "$current" ] || { printf 'command_cleanup=FAIL remaining_pids=' >&2; tr '\n' ' ' < "$current" >&2; printf '\n' >&2; rm -f "$current"; return 1; }
  rm -f "$current"
  assert_no_listeners || { printf 'command_cleanup=FAIL listener_remains=1\n' >&2; return 1; }
}

case "$mode" in
  list|cleanup|run)
    printf '%s' "$token" | grep -Eq '^[0-9a-f]{64}$' || { printf 'command_token=FAIL invalid\n' >&2; exit 125; }
    ;;
esac

case "$mode" in
  list)
    live_token_pids
    ;;
  unexpected)
    unexpected_live_pids
    ;;
  cleanup)
    session_file="/tmp/switchback-offload-command-$token.sid"
    session=
    [ ! -f "$session_file" ] || read -r session < "$session_file"
    cleanup_token_processes "/tmp/switchback-offload-command-$token.pids" "$session"
    ;;
  cleanup-token)
    # Signal cleanup must be token-scoped so a client disconnect cannot reap
    # an unrelated process that happened to start after the command snapshot.
    cleanup_token_processes "" ""
    ;;
  run)
    command_b64=${3:-}
    [ -n "$token" ] && [ -n "$command_b64" ] || exit 2
    token_file="/tmp/switchback-offload-command-token-$$"
    live_token_pids > "$token_file"
    [ ! -s "$token_file" ] || { rm -f "$token_file"; printf 'command_start=FAIL token_already_active=1\n' >&2; exit 125; }
    rm -f "$token_file"
    assert_no_listeners || { printf 'command_start=FAIL listener_already_present=1\n' >&2; exit 125; }
    command=$(printf '%s' "$command_b64" | base64 -d)
    cd /workspace
    snapshot_file="/tmp/switchback-offload-command-$token.pids"
    session_file="/tmp/switchback-offload-command-$token.sid"
    live_pids > "$snapshot_file"
    command_pid=
    interrupted=0
    forward_signal() {
      interrupted=143
      if [ -n "$command_pid" ]; then
        kill -TERM -- "-$command_pid" 2>/dev/null || kill -TERM "$command_pid" 2>/dev/null || true
      fi
    }
    trap 'forward_signal' INT HUP TERM
    export SWITCHBACK_OFFLOAD_COMMAND_TOKEN="$token"
    setsid sh -lc "$command" &
    command_pid=$!
    printf '%s\n' "$command_pid" > "$session_file"
    set +e
    wait "$command_pid"
    command_rc=$?
    set -e
    trap - INT HUP TERM
    [ "$interrupted" -eq 0 ] || command_rc=$interrupted
    cleanup_rc=0
    cleanup_token_processes "$snapshot_file" "$command_pid" || cleanup_rc=$?
    rm -f "$snapshot_file"
    rm -f "$session_file"
    printf 'command_exit=%s\n' "$command_rc"
    if [ "$cleanup_rc" -ne 0 ]; then
      printf 'command_runner_exit=125\n'
      exit 125
    fi
    printf 'command_cleanup=PASS token_processes=0 listeners=0\n'
    exit "$command_rc"
    ;;
  *)
    exit 2
    ;;
esac
EOF
}

container_lifecycle() {
  local mode="$1" token="${2:-}" command_b64="${3:-}"
  remote sh -s <<EOF
set -eu
printf '%s' '$LIFECYCLE_SCRIPT_B64' | base64 -d | docker exec -i '$CONTAINER' env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN sh -s -- '$mode' '$token' '$command_b64'
EOF
}

sync_evidence() {
  local strict="$1" evidence_name=evidence archive
  if [[ "$strict" == command ]]; then evidence_name="command-evidence-$(date -u +%H%M%S)-$(openssl rand -hex 4)"; fi
  EVIDENCE_DIR="$LOCAL_ROOT/$evidence_name"
  [[ ! -e "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || die "evidence destination is not fresh"
  mkdir "$EVIDENCE_DIR"
  remote sh -s <<EOF
set -eu
test -f '$REMOTE_ROOT/owner-token'
test "\$(cat '$REMOTE_ROOT/owner-token')" = '$OWNER_TOKEN'
test -f '$REMOTE_ROOT/source.sha256' -a -f '$REMOTE_ROOT/remote-allowlist.txt' -a -f '$REMOTE_ROOT/summary.txt'
for log in preflight npm-ci unit-mobile-qa typecheck lint playwright-fast-list playwright-prepare-list playwright-full-list; do test -f '$REMOTE_ROOT/logs/'"\$log"'.log'; done
if [ '$strict' = command ]; then test -f '$REMOTE_ROOT/logs/retained-source-before.log' -a -f '$REMOTE_ROOT/logs/retained-source-after.log'; fi
if [ '$strict' = success ]; then grep -qx 'baseline_exit=0' '$REMOTE_ROOT/summary.txt'; fi
EOF
  archive="$(mktemp "$LOCAL_ROOT/evidence.XXXXXX.tar")"
  remote tar --directory="$REMOTE_ROOT" --create --file=- logs source/artifacts/mobile-qa summary.txt source.sha256 remote-allowlist.txt > "$archive"
  tar --extract --keep-old-files --no-same-owner --file="$archive" --directory="$EVIDENCE_DIR"
  rm -f "$archive"
  for path in logs/preflight.log logs/npm-ci.log logs/unit-mobile-qa.log logs/typecheck.log logs/lint.log \
    logs/playwright-fast-list.log logs/playwright-prepare-list.log logs/playwright-full-list.log summary.txt source.sha256 remote-allowlist.txt; do
    [[ -f "$EVIDENCE_DIR/$path" ]] || die "synced evidence is incomplete"
  done
  printf 'evidence=PASS path=%s\n' "$EVIDENCE_DIR" | tee "$LOCAL_ROOT/evidence-result.txt"
}

cleanup_owned() {
  [[ "$CREATED_BY_SYNC" == 1 && "$KEEP_RUN" == 0 ]] || return 0
  set +e
  remote sh -s <<EOF
set +e
root_ok=0; if test -f '$REMOTE_ROOT/owner-token' && test "\$(cat '$REMOTE_ROOT/owner-token')" = '$OWNER_TOKEN'; then root_ok=1; fi
container_ok=1; if docker inspect '$CONTAINER' >/dev/null 2>&1; then test "\$(docker inspect '$CONTAINER' --format '{{index .Config.Labels "com.switchback.offload.owner"}}')" = '$OWNER_TOKEN' || container_ok=0; fi
install_ok=1; if docker network inspect '$INSTALL_NETWORK' >/dev/null 2>&1; then test "\$(docker network inspect '$INSTALL_NETWORK' --format '{{index .Labels "com.switchback.offload.owner"}}')" = '$OWNER_TOKEN' || install_ok=0; fi
test_ok=1; if docker network inspect '$TEST_NETWORK' >/dev/null 2>&1; then test "\$(docker network inspect '$TEST_NETWORK' --format '{{index .Labels "com.switchback.offload.owner"}}')" = '$OWNER_TOKEN' || test_ok=0; fi
if test "\$root_ok" = 1 && test "\$container_ok" = 1 && test "\$install_ok" = 1 && test "\$test_ok" = 1; then
  docker rm -f '$CONTAINER' >/dev/null 2>&1 || true
  docker network rm '$INSTALL_NETWORK' >/dev/null 2>&1 || true
  docker network rm '$TEST_NETWORK' >/dev/null 2>&1 || true
  rm -rf '$REMOTE_ROOT'
fi
EOF
  set -e
}

on_exit() { local rc=$?; trap - EXIT; cleanup_owned || rc=1; exit "$rc"; }

self_test() {
  local marker payload encoded decoded hash_root lifecycle_run_id port_seed first_port second_port concurrent_port child_command release_command concurrent_command concurrent_output first_pid first_rc second_rc rc concurrent_marker_line concurrent_token concurrent_owner_pid handoff_rc sigkill_port sigkill_command sigkill_output sigkill_run_pid sigkill_marker_line sigkill_token sigkill_owner_pid sigkill_second_rc
  marker="$(mktemp)"; rm -f "$marker"
  payload="printf '%s\\n' '\$(touch $marker)'"
  encoded="$(printf '%s' "$payload" | base64 -w0)"
  decoded="$(printf '%s' "$encoded" | base64 -d)"
  [[ "$decoded" == "$payload" && ! -e "$marker" ]] || die "command encoding self-test failed"
  hash_root="$(mktemp -d)"
  printf 'original\\n' > "$hash_root/source.txt"
  (cd "$hash_root" && sha256sum source.txt > manifest.sha256)
  printf 'tampered\\n' > "$hash_root/source.txt"
  if (cd "$hash_root" && sha256sum -c manifest.sha256 >/dev/null 2>&1); then
    rm -rf -- "$hash_root"
    die "tampered retained-source self-test was accepted"
  fi
  rm -rf -- "$hash_root"
  echo "retained-source-tamper-test=PASS"
  if [[ "not-a-command-token" =~ ^[0-9a-f]{64}$ ]]; then die "invalid command token self-test accepted"; fi
  echo "invalid-command-token=PASS"
  if "$0" run offload-self-test -- true >/dev/null 2>&1; then die "metadata rejection self-test failed"; fi
  lifecycle_run_id="$(printenv SWITCHBACK_OFFLOAD_SELF_TEST_RUN_ID 2>/dev/null || true)"
  if [[ -n "$lifecycle_run_id" ]]; then
    [[ "$lifecycle_run_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || die "invalid lifecycle self-test run id"
    RUN_ID="$lifecycle_run_id"
    set_names
    port_seed="$(od -An -N2 -tu2 /dev/urandom | tr -d ' ')"
    first_port=$((30000 + port_seed % 2000))
    second_port=$((first_port + 1))
    child_command="env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN node -e 'require(\"net\").createServer().listen($first_port,\"127.0.0.1\")' &"
    set +e
    "$0" run "$lifecycle_run_id" -- "$child_command"
    rc=$?
    set -e
    (( rc == 0 )) || die "lifecycle child-listener self-test failed with exit $rc"
    echo "lifecycle-child-listener-cleanup=PASS port=$first_port"
    release_command="node -e 'const net=require(\"net\"); const server=net.createServer(); server.listen($second_port,\"127.0.0.1\",()=>server.close())'"
    set +e
    "$0" run "$lifecycle_run_id" -- "$release_command"
    rc=$?
    set -e
    (( rc == 0 )) || die "lifecycle sequential self-test failed with exit $rc"
    echo "lifecycle-sequential-commands=PASS ports=$first_port,$second_port"
    concurrent_port=$((second_port + 1))
    concurrent_command="node -e 'require(\"net\").createServer().listen($concurrent_port,\"127.0.0.1\"); setTimeout(()=>{},30000)'"
    concurrent_output="$(mktemp)"
    set +e
    "$0" run "$lifecycle_run_id" -- "$concurrent_command" > "$concurrent_output" 2>&1 &
    first_pid=$!
    set -e
    for _ in $(seq 1 20); do
      if remote test -f "$REMOTE_ROOT/command-owner"; then break; fi
      sleep 1
    done
    set +e
    "$0" run "$lifecycle_run_id" -- true >/dev/null 2>&1
    second_rc=$?
    set -e
    concurrent_marker_line="$(remote cat "$REMOTE_ROOT/command-owner")"
    read -r concurrent_token concurrent_owner_pid concurrent_extra <<< "$concurrent_marker_line"
    [[ "$concurrent_token" =~ ^[0-9a-f]{64}$ && "$concurrent_owner_pid" =~ ^[0-9]+$ && -z "${concurrent_extra:-}" ]] || die "concurrent lifecycle marker invalid"
    remote kill -TERM "$concurrent_owner_pid" || true
    kill -TERM "$first_pid" 2>/dev/null || true
    set +e
    wait "$first_pid"
    first_rc=$?
    set -e
    rm -f "$concurrent_output"
    (( second_rc != 0 && first_rc == 143 )) || die "concurrent command lock self-test failed first=$first_rc second=$second_rc"
    echo "concurrent-run-lock=PASS first_exit=$first_rc second_exit=$second_rc"
    set +e
    "$0" run "$lifecycle_run_id" -- true >/dev/null 2>&1
    handoff_rc=$?
    set -e
    (( handoff_rc == 0 )) || die "concurrent lifecycle handoff failed with exit $handoff_rc"
    remote test ! -e "$REMOTE_ROOT/command-owner" || die "concurrent lifecycle marker did not release"
    sigkill_port=$((concurrent_port + 1))
    sigkill_command="env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN node -e 'require(\"net\").createServer().listen($sigkill_port,\"127.0.0.1\"); setTimeout(()=>{},30000)' & sleep 30"
    sigkill_output="$(mktemp)"
    set +e
    "$0" run "$lifecycle_run_id" -- "$sigkill_command" > "$sigkill_output" 2>&1 &
    sigkill_run_pid=$!
    set -e
    for _ in $(seq 1 20); do
      if remote test -f "$REMOTE_ROOT/command-owner"; then break; fi
      sleep 1
    done
    sigkill_marker_line="$(remote cat "$REMOTE_ROOT/command-owner")"
    read -r sigkill_token sigkill_owner_pid sigkill_extra <<< "$sigkill_marker_line"
    [[ "$sigkill_token" =~ ^[0-9a-f]{64}$ && "$sigkill_owner_pid" =~ ^[0-9]+$ && -z "${sigkill_extra:-}" ]] || die "SIGKILL lifecycle marker invalid"
    remote kill -KILL "$sigkill_owner_pid"
    kill -TERM "$sigkill_run_pid" 2>/dev/null || true
    set +e
    wait "$sigkill_run_pid"
    set -e
    set +e
    "$0" run "$lifecycle_run_id" -- true >/dev/null 2>&1
    sigkill_second_rc=$?
    set -e
    rm -f "$sigkill_output"
    (( sigkill_second_rc == 0 )) || die "SIGKILL lifecycle recovery failed with exit $sigkill_second_rc"
    echo "sigkill-full-wrapper-recovery=PASS port=$sigkill_port"
  fi
  grep -Fq -- '--init' "$0" || die "docker init self-test failed"
  echo "docker-init-reaper-flag=PASS"
  echo "self-test=PASS"
}

reject_ambient
if [[ "$MODE" == "-h" || "$MODE" == "--help" ]]; then usage; exit 0; fi
if [[ "$MODE" == self-test ]]; then self_test; exit 0; fi
if [[ "$MODE" == run ]]; then
  [[ $# -eq 4 && "$3" == -- && -n "$4" ]] || { usage >&2; exit 2; }
  RUN_ID=$2
  [[ "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || die "invalid run id"
  set_names
  LOCAL_ROOT="$ROOT/artifacts/mobile-qa/offload/$RUN_ID"; SNAPSHOT_ROOT="$LOCAL_ROOT/source-snapshot"; LOCAL_LOG_ROOT="$LOCAL_ROOT/logs"
  for directory in "$ROOT/artifacts" "$ROOT/artifacts/mobile-qa" "$ROOT/artifacts/mobile-qa/offload"; do
    [[ ! -L "$directory" ]] || die "artifact parent is a symlink"
  done
  [[ -d "$LOCAL_ROOT" && ! -L "$LOCAL_ROOT" ]] || die "run artifact destination is missing or symlinked"
  read_local_metadata; LIFECYCLE_SCRIPT_B64="$(command_lifecycle_script | base64 -w0)"; resolve_target | tee -a "$LOCAL_LOG_ROOT/run-identity.log"
  remote sh -s >> "$LOCAL_LOG_ROOT/run-preflight.txt" <<EOF
set -eu
command -v flock >/dev/null 2>&1
test "\$(docker context show)" = default
test "\$(docker context inspect default --format '{{(index .Endpoints "docker").Host}}')" = unix:///var/run/docker.sock
test "\$(docker image inspect '$IMAGE' --format '{{.Id}}')" = '$EXPECTED_IMAGE_ID'
test "\$(sha256sum '$REMOTE_ROOT/source.sha256' | awk '{ print \$1 }')" = '$MANIFEST_HASH'
test "\$(cat '$REMOTE_ROOT/owner-token')" = '$OWNER_TOKEN'
EOF
  cat "$LOCAL_LOG_ROOT/run-preflight.txt"
  verify_container_state "$TEST_NETWORK" true
  verify_retained_source before
  command=$4; encoded="$(printf '%s' "$command" | base64 -w0)"; command_token="$(openssl rand -hex 32)"
  run_finished=0
  run_exit_cleanup() {
    local run_rc=$? cleanup_rc=0
    trap - EXIT INT HUP TERM
    if [[ -n "${command_token:-}" ]]; then
      set +e
      container_lifecycle cleanup-token "$command_token" > "$LOCAL_LOG_ROOT/command-cleanup.log" 2>&1
      cleanup_rc=$?
      set -e
      (( cleanup_rc == 0 )) || run_rc=125
    fi
    if [[ -n "${remote_pid:-}" ]]; then
      kill -TERM "$remote_pid" 2>/dev/null || true
      wait "$remote_pid" 2>/dev/null || true
    fi
    if (( cleanup_rc == 0 )); then
      local evidence_rc=0
      set +e
      verify_retained_source after || evidence_rc=1
      (( evidence_rc == 0 )) && sync_evidence command || evidence_rc=1
      set -e
      (( evidence_rc == 0 )) || run_rc=125
    fi
    exit "$run_rc"
  }
  trap run_exit_cleanup EXIT
  trap 'exit 143' INT HUP TERM
  set +e
  remote sh -s > >(tee -a "$LOCAL_LOG_ROOT/command.log") 2>&1 <<EOF &
set +e
lock='$REMOTE_ROOT/command.lock'
flock --nonblock --close "\$lock" sh -s <<'EOF_LIFECYCLE'
set +e
command="\$(printf '%s' '$encoded' | base64 -d)"
printf '%s\\n' "\$command" >> '$REMOTE_ROOT/logs/command.txt'
marker='$REMOTE_ROOT/command-owner'
token='$command_token'
completed=0
if test -e "\$marker"; then
  old_line="\$(cat "\$marker" 2>/dev/null || true)"
  read -r old_token old_pid old_extra <<EOF_OWNER
\$old_line
EOF_OWNER
  printf '%s' "\$old_token" | grep -Eq '^[0-9a-f]{64}$' || { printf 'command_lock=FAIL invalid_owner\\n' >&2; exit 125; }
  case "\$old_pid" in ''|*[!0-9]*) printf 'command_lock=FAIL invalid_owner\\n' >&2; exit 125;; esac
  [ -z "\${old_extra:-}" ] || { printf 'command_lock=FAIL invalid_owner\\n' >&2; exit 125; }
  printf '%s' '$LIFECYCLE_SCRIPT_B64' | base64 -d | docker exec -i '$CONTAINER' env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN sh -s -- cleanup "\$old_token" >> '$REMOTE_ROOT/logs/command.log' 2>&1 || { printf 'command_lock=FAIL stale_cleanup=1\\n' >&2; exit 125; }
  test "\$(cat "\$marker")" = "\$old_token \$old_pid"
  rm -f "\$marker"
fi
unexpected="\$(printf '%s' '$LIFECYCLE_SCRIPT_B64' | base64 -d | docker exec -i '$CONTAINER' env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN sh -s -- unexpected)"
[ -z "\$unexpected" ] || { printf '%s\\n' "\$unexpected" >&2; printf 'command_start=FAIL unexpected_process\\n' >&2; exit 125; }
printf '%s %s\\n' "\$token" "\$\$" > "\$marker"
chmod 600 "\$marker"
cleanup_marker() {
  [ "\$completed" -eq 1 ] || return 0
  test "\$(cat "\$marker" 2>/dev/null || true)" = "\$token \$\$" || return 0
  rm -f "\$marker"
}
trap cleanup_marker EXIT
exec_pid=
tee_pid=
output_fifo=
terminate_command() {
  trap - INT HUP TERM
  [ -z "\$exec_pid" ] || kill -TERM "\$exec_pid" 2>/dev/null || true
  printf '%s' '$LIFECYCLE_SCRIPT_B64' | base64 -d | docker exec -i '$CONTAINER' env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN sh -s -- cleanup "\$token" >> '$REMOTE_ROOT/logs/command.log' 2>&1 || true
  [ -z "\$exec_pid" ] || wait "\$exec_pid" 2>/dev/null || true
  [ -z "\$tee_pid" ] || wait "\$tee_pid" 2>/dev/null || true
  rm -f "\$output_fifo"
  exit 143
}
trap terminate_command INT HUP TERM
output_fifo="/tmp/switchback-offload-command-\$token.output"
rm -f "\$output_fifo"
mkfifo "\$output_fifo"
tee -a '$REMOTE_ROOT/logs/command.log' < "\$output_fifo" &
tee_pid=\$!
(printf '%s' '$LIFECYCLE_SCRIPT_B64' | base64 -d | docker exec -i '$CONTAINER' env -u SWITCHBACK_OFFLOAD_COMMAND_TOKEN sh -s -- run "\$token" '$encoded') > "\$output_fifo" 2>&1 &
exec_pid=\$!
wait "\$exec_pid"
rc=\$?
wait "\$tee_pid" 2>/dev/null || true
rm -f "\$output_fifo"
printf 'command_runner_exit=%s\\n' "\$rc" >> '$REMOTE_ROOT/logs/command.log'
 completed=1
 trap - INT HUP TERM
 printf 'command_runner_exit=%s\\n' "\$rc"
 exit "\$rc"
EOF_LIFECYCLE
lifecycle_rc=\$?
exit "\$lifecycle_rc"
EOF
  remote_pid=$!
  wait "$remote_pid"
  rc=$?
  run_finished=1
  trap - INT HUP TERM
  trap - EXIT
  set -e; cat "$LOCAL_LOG_ROOT/command.log"
  integrity_rc=0
  if ! verify_retained_source after; then integrity_rc=1; fi
  if (( rc != 0 || integrity_rc != 0 )); then rc=1; fi
  sync_evidence command; exit "$rc"
fi

[[ "$MODE" == sync && $# -le 1 ]] || { usage >&2; exit 2; }
run_override="$(printenv SWITCHBACK_OFFLOAD_RUN_ID 2>/dev/null || true)"
if [[ -n "$run_override" ]]; then RUN_ID=$run_override; else RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 6)"; fi
[[ "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] || die "invalid run id"
OWNER_TOKEN="$(openssl rand -hex 32)"; [[ "$OWNER_TOKEN" =~ ^[0-9a-f]{64}$ ]] || die "owner token generation failed"
MANIFEST_HASH=; KEEP_RUN=0; CREATED_BY_SYNC=0
set_names; assert_fresh_destination; trap on_exit EXIT; trap 'exit 130' INT HUP; trap 'exit 143' TERM
resolve_target | tee "$LOCAL_ROOT/identity.txt"
if remote test -e "$REMOTE_ROOT"; then die "remote run path already exists"; fi
CREATED_BY_SYNC=1
remote_preflight; build_allowlist; prepare_remote_source; verify_source; prepare_remote_artifacts; create_container; verify_container_state "$INSTALL_NETWORK" false
if ! run_install; then
  remote sh -s > "$LOCAL_LOG_ROOT/summary-write.txt" <<EOF
set -eu
printf 'run_id=%s\\nmanifest_hash=%s\\nimage_id=%s\\nbaseline_exit=install-failed\\n' '$RUN_ID' '$MANIFEST_HASH' '$EXPECTED_IMAGE_ID' > '$REMOTE_ROOT/summary.txt'
EOF
  sync_evidence failure; die "npm ci failed; owned scratch was cleaned"
fi
move_to_internal_network
verify_container_state "$TEST_NETWORK" true
set +e; run_baselines; baseline_rc=$?; set -e
write_summary "$baseline_rc"
if (( baseline_rc == 0 )); then sync_evidence success; KEEP_RUN=1; else sync_evidence failure; fi
printf 'run_id=%s\nremote_root=%s\ncontainer=%s\ntest_network=%s\nbaseline_exit=%s\n' "$RUN_ID" "$REMOTE_ROOT" "$CONTAINER" "$TEST_NETWORK" "$baseline_rc" | tee "$LOCAL_ROOT/summary.txt"
exit "$baseline_rc"
