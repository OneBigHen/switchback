import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../../..")
const resolver = resolve(root, "deployment/lib/resolve-data-root.sh")

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

function runResolver(options: {
  dataRoot?: string
  docker?: string
  legacyRoot: string
}) {
  const bin = mkdtempSync(join(tmpdir(), "switchback-docker-"))
  if (options.docker) {
    const docker = join(bin, "docker")
    writeFileSync(docker, `#!/usr/bin/env bash\n${options.docker}`)
    chmodSync(docker, 0o755)
  }

  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }
  if (options.dataRoot === undefined) delete env.SWITCHBACK_DATA_ROOT
  else env.SWITCHBACK_DATA_ROOT = options.dataRoot
  env.SWITCHBACK_LEGACY_DATA_ROOT = options.legacyRoot

  const result = spawnSync(
    "bash",
    ["-c", `source ${shellQuote(resolver)}\nresolve_switchback_data_root`],
    { encoding: "utf8", env },
  )
  rmSync(bin, { recursive: true, force: true })
  return result
}

describe("resolve_switchback_data_root", () => {
  it("prefers an explicit root without invoking Docker", () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), "switchback-legacy-"))
    const explicitRoot = join(tmpdir(), "switchback explicit root")
    const result = runResolver({
      dataRoot: explicitRoot,
      legacyRoot,
      docker: "exit 99",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`${explicitRoot}\n`)
    expect(result.stderr).toBe("")
    rmSync(legacyRoot, { recursive: true, force: true })
  })

  it("uses the /data mount source reported for the production web container", () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), "switchback-legacy-"))
    const mountRoot = join(tmpdir(), "switchback docker root with spaces")
    const result = runResolver({
      legacyRoot,
      docker: `
if [ "$1" = "ps" ]; then
  printf '%s\\n' web-container
elif [ "$1" = "inspect" ]; then
  printf '%s\\n' ${shellQuote(mountRoot)}
else
  exit 1
fi
`,
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`${mountRoot}\n`)
    rmSync(legacyRoot, { recursive: true, force: true })
  })

  it("accepts the legacy root only when Switchback state exists", () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), "switchback-legacy-"))
    mkdirSync(join(legacyRoot, "app"))
    writeFileSync(join(legacyRoot, "app", "community.sqlite"), "sqlite")
    const result = runResolver({ legacyRoot, docker: "exit 1" })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`${legacyRoot}\n`)
    rmSync(legacyRoot, { recursive: true, force: true })
  })

  it("rejects an empty legacy directory", () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), "switchback-legacy-"))
    const result = runResolver({ legacyRoot, docker: "exit 1" })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Unable to resolve Switchback data root")
    rmSync(legacyRoot, { recursive: true, force: true })
  })

  it("fails closed when Docker cannot identify exactly one mount source", () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), "switchback-legacy-"))
    const missing = runResolver({ legacyRoot, docker: "exit 1" })
    const ambiguous = runResolver({
      legacyRoot,
      docker: `
if [ "$1" = "ps" ]; then
  printf 'web-one\\nweb-two\\n'
elif [ "$1" = "inspect" ]; then
  printf '/var/lib/docker/volumes/one/_data\\n/var/lib/docker/volumes/two/_data\\n'
fi
`,
    })

    expect(missing.status).not.toBe(0)
    expect(ambiguous.status).not.toBe(0)
    expect(ambiguous.stderr).toContain("ambiguous")
    rmSync(legacyRoot, { recursive: true, force: true })
  })
})
