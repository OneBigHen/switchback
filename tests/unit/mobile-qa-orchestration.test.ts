import { describe, expect, it } from "vitest"
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  FAST_EXPECTED_FILES,
  FAST_EXPECTED_TESTS,
  MOBILE_QA_CHUNKS,
  buildChunkArgs,
  buildDiscoveryArgs,
  collectChunkResults,
  formatDryRunPlan,
  assertInventoryArtifactTree,
  appendBoundedProcessOutput,
  cleanupOwnedProcesses,
  enumerateOwnedProcessIdentities,
  renderMobileQaInventory,
  runMobileQa,
  summarizeChunkResults,
  validateFastCoverage,
  validateDiscovery,
  type MobileQaChunkResult,
} from "../../scripts/qa/mobile-qa-orchestrator"
import { validateMobileQaPort } from "../../scripts/qa/mobile-qa-port"

function chunkResult(
  chunkId: string,
  project: string,
  tests: readonly string[],
  exitCode = 0,
): MobileQaChunkResult {
  return { chunkId, exitCode, projects: [{ name: project, status: exitCode === 0 ? "passed" : "failed", tests: tests.length, failures: exitCode === 0 ? 0 : 1, skipped: 0, testIds: tests }] }
}

describe("mobile QA FAST orchestration", () => {
  it("keeps the standard WebKit ride in its own browser invocation", () => {
    expect(MOBILE_QA_CHUNKS).toEqual([
      expect.objectContaining({ id: "webkit-core", project: "webkit-standard", testCount: 18 }),
      expect.objectContaining({ id: "webkit-free-ride-suggestion", project: "webkit-standard", testCount: 1, grep: "Free Ride suggestion is reachable by touch and can enter guidance" }),
      expect.objectContaining({ id: "webkit-ride", project: "webkit-standard", testCount: 6, grepInvert: "Free Ride suggestion is reachable by touch and can enter guidance" }),
      expect.objectContaining({ id: "chromium-core", project: "chromium-standard", testCount: 25 }),
    ])
    expect(MOBILE_QA_CHUNKS.flatMap((chunk) => chunk.files)).toHaveLength(11)
    expect(MOBILE_QA_CHUNKS.reduce((total, chunk) => total + chunk.testCount, 0)).toBe(FAST_EXPECTED_TESTS)
  })

  it("builds a no-retry command with the chunk's exact expected project", () => {
    const args = buildChunkArgs(MOBILE_QA_CHUNKS[1])
    expect(args).toContain("--project=webkit-standard")
    expect(args).toContain("--grep=Free Ride suggestion is reachable by touch and can enter guidance")
    expect(args).toContain("--retries=0")
    expect(args).toContain("--workers=1")
    expect(args).not.toContain("--project=chromium-standard")
  })

  it("rejects zero, duplicate, and missing test coverage", () => {
    const ride = chunkResult("webkit-free-ride-suggestion", "webkit-standard", ["webkit-standard:ride:1"])
    expect(() => validateFastCoverage([ride])).toThrow(/expected 4 chunks/)

    const valid = MOBILE_QA_CHUNKS.map((chunk) => chunkResult(
      chunk.id,
      chunk.project,
      Array.from({ length: chunk.testCount }, (_, index) => `${chunk.project}:${chunk.id}:${index}`),
    ))
    expect(() => validateFastCoverage(valid)).not.toThrow()

    const duplicate = valid.map((result) => ({ ...result, projects: result.projects.map((project) => ({ ...project, testIds: project.testIds.map((key, index) => index === 1 ? project.testIds[0] ?? key : key) })) }))
    expect(() => validateFastCoverage(duplicate)).toThrow(/duplicate test ID/i)

    const zero = valid.map((result) => result.chunkId === "webkit-free-ride-suggestion"
      ? chunkResult(result.chunkId, "webkit-standard", [])
      : result)
    expect(() => validateFastCoverage(zero)).toThrow(/selected 0; expected 1/i)

    const skipped = valid.map((result) => result.chunkId === "webkit-free-ride-suggestion"
      ? { ...result, projects: result.projects.map((project) => ({ ...project, skipped: 1 })) }
      : result)
    expect(() => validateFastCoverage(skipped)).toThrow(/skipped 1 tests/i)
  })

  it("continues after a failed chunk and aggregates a failing exit", () => {
    const results = MOBILE_QA_CHUNKS.map((chunk) => chunkResult(
      chunk.id,
      chunk.project,
      Array.from({ length: chunk.testCount }, (_, index) => `${chunk.project}:${chunk.id}:${index}`),
      chunk.id === "webkit-free-ride-suggestion" ? 1 : 0,
    ))
    const summary = summarizeChunkResults(results)
    expect(summary.totalTests).toBe(FAST_EXPECTED_TESTS)
    expect(summary.totalFiles).toBe(FAST_EXPECTED_FILES)
    expect(summary.exitCode).toBe(1)
    expect(summary.failedChunks).toEqual(["webkit-free-ride-suggestion"])
  })

  it("runs every independent chunk after a process failure", async () => {
    const calls: string[] = []
    const results = await collectChunkResults(MOBILE_QA_CHUNKS, false, async (chunk) => {
      calls.push(chunk.id)
      return { status: chunk.id === "webkit-core" ? 1 : 0, stdout: "", stderr: "" }
    })
    expect(calls).toEqual(MOBILE_QA_CHUNKS.map((chunk) => chunk.id))
    expect(results).toHaveLength(4)
    expect(summarizeChunkResults(results).exitCode).toBe(1)
  })

  it("uses a machine-readable full discovery invocation", () => {
    expect(buildDiscoveryArgs()).toEqual(expect.arrayContaining(["--list", "--project=webkit-standard", "--project=chromium-standard"]))
  })

  it("marks list inventory as NOT RUN and never as browser PASS", () => {
    const inventory = renderMobileQaInventory({ exitCode: 0, totalTests: 50, totalFiles: 5, failedChunks: [] })
    expect(inventory).toContain("Mode: INVENTORY (NOT RUN)")
    expect(inventory).not.toContain("Mobile responsive emulation: PASS")
    expect(inventory).not.toContain("WebKit mobile approximation: PASS")
  })

  it("prints discovery and all chunks in both dry-run modes", () => {
    const normalPlan = formatDryRunPlan(false)
    const listPlan = formatDryRunPlan(true)
    expect(normalPlan).toHaveLength(5)
    expect(normalPlan[0]).toContain("--list")
    expect(normalPlan.slice(1).every((line) => !line.includes(" --list "))).toBe(true)
    expect(listPlan.slice(1).every((line) => line.includes(" --list "))).toBe(true)
  })

  it("keeps dry-run read-only", async () => {
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-dry-run-"))
    writeFileSync(join(root, "sentinel"), "keep")
    const previousRoot = process.env.MOBILE_QA_ARTIFACT_ROOT
    try {
      process.env.MOBILE_QA_ARTIFACT_ROOT = root
      expect(await runMobileQa(["--dry-run", "--list"])).toBe(0)
      expect(existsSync(join(root, "sentinel"))).toBe(true)
      expect(readdirSync(root)).toEqual(["sentinel"])
    } finally {
      if (previousRoot === undefined) delete process.env.MOBILE_QA_ARTIFACT_ROOT
      else process.env.MOBILE_QA_ARTIFACT_ROOT = previousRoot
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("bounds retained child output while allowing streaming", () => {
    const limit = 8
    expect(appendBoundedProcessOutput("", "123456789", limit)).toBe("23456789")
    expect(appendBoundedProcessOutput("23456789", "ab", limit)).toBe("456789ab")
  })

  it("streams the remote command and cleans the exact token on local interruption", () => {
    const runner = readFileSync(join(process.cwd(), "scripts/qa/offload-mobile-qa.sh"), "utf8")
    expect(runner).toContain('remote sh -s > >(tee -a "$LOCAL_LOG_ROOT/command.log") 2>&1 <<EOF &')
    expect(runner).toContain('container_lifecycle cleanup-token "$command_token" > "$LOCAL_LOG_ROOT/command-cleanup.log" 2>&1')
    expect(runner).toContain('wait "$remote_pid" 2>/dev/null || true')
    expect(runner).toContain("sync_evidence command")
    expect(runner).toContain("command_cleanup=PASS token_processes=0 listeners=0")
  })

  it("derives exact chunk IDs from full discovery file/title predicates", () => {
    const files = [
      "tests/e2e/mobile-qa/core/library-settings.core.spec.ts",
      "tests/e2e/mobile-qa/core/offline.core.spec.ts",
      "tests/e2e/mobile-qa/core/planner.core.spec.ts",
      "tests/e2e/mobile-qa/core/ride.core.spec.ts",
      "tests/e2e/mobile-qa/core/scroll-owner.core.spec.ts",
    ]
    const webkitTests = Array.from({ length: 18 }, (_, index) => ({ id: `w-core-${index}`, file: files[index % 3]!, title: `core-${index}` }))
      .concat([{ id: "w-suggestion", file: files[3]!, title: "Free Ride suggestion is reachable by touch and can enter guidance" }])
      .concat(Array.from({ length: 6 }, (_, index) => ({ id: `w-ride-${index}`, file: files[3]!, title: `ride-${index}` })))
    const chromiumTests = Array.from({ length: 25 }, (_, index) => ({ id: `c-${index}`, file: files[index % files.length]!, title: `chromium-${index}` }))
    const full = { runId: "unit", projects: [
      { name: "webkit-standard", tests: webkitTests },
      { name: "chromium-standard", tests: chromiumTests },
    ] }
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-discovery-validation-"))
    try {
      mkdirSync(join(root, "orchestration"), { recursive: true })
      const writeChunkTests = (chunkId: string, tests: readonly { id: string; file: string; title: string }[]) => {
        const chunk = MOBILE_QA_CHUNKS.find((candidate) => candidate.id === chunkId)!
        writeFileSync(join(root, "orchestration", `${chunk.id}.discovery.inventory.json`), JSON.stringify({ runId: "unit", projects: [{ name: chunk.project, tests }] }))
      }
      const writeValidChunks = () => {
        writeChunkTests("webkit-core", webkitTests.slice(0, 18))
        writeChunkTests("webkit-free-ride-suggestion", webkitTests.slice(18, 19))
        writeChunkTests("webkit-ride", webkitTests.slice(19))
        writeChunkTests("chromium-core", chromiumTests)
      }
      writeValidChunks()
      expect(() => validateDiscovery(root, full)).not.toThrow()

      const suggestionPath = join(root, "orchestration", "webkit-free-ride-suggestion.discovery.inventory.json")
      writeFileSync(suggestionPath, JSON.stringify({ runId: "unit", projects: [{ name: "webkit-standard", tests: [webkitTests[19]] }] }))
      expect(() => validateDiscovery(root, full)).toThrow(/discovery mismatch.*webkit-free-ride-suggestion/i)

      writeValidChunks()
      writeChunkTests("webkit-ride", [...webkitTests.slice(19, 24), webkitTests[19]!])
      expect(() => validateDiscovery(root, full)).toThrow(/discovery mismatch.*webkit-ride/i)

      writeValidChunks()
      writeChunkTests("webkit-ride", [...webkitTests.slice(19, 24), webkitTests[18]!])
      expect(() => validateDiscovery(root, full)).toThrow(/discovery duplicated test ID|discovery mismatch.*webkit-ride/i)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("cleans only token-owned detached listeners and leaves unrelated processes alive", async () => {
    const token = `unit-mobile-qa-${Date.now()}-${process.pid}`
    const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" })
    const owned = spawn(process.execPath, ["-e", "const {spawn}=require('node:child_process'); const net=require('node:net'); net.createServer().listen(0); spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{detached:true,stdio:'ignore'}); setTimeout(()=>{},30000)"], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, MOBILE_QA_PROCESS_TOKEN: token },
    })
    try {
      expect(owned.pid).toBeGreaterThan(1)
      await new Promise((resolve) => setTimeout(resolve, 150))
      await cleanupOwnedProcesses(token)
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow()
      expect(enumerateOwnedProcessIdentities(token)).toEqual([])
    } finally {
      await cleanupOwnedProcesses(token)
      unrelated.kill("SIGKILL")
    }
  }, 10_000)

  it("accepts only the docker-init idle topology and rejects an extra sleep", () => {
    const runner = readFileSync(join(process.cwd(), "scripts/qa/offload-mobile-qa.sh"), "utf8")
    const functionStart = runner.indexOf("unexpected_live_pids() {")
    const functionEnd = runner.indexOf("\n\nassert_no_listeners", functionStart)
    const functionSource = functionStart >= 0 && functionEnd > functionStart ? runner.slice(functionStart, functionEnd) : undefined
    expect(functionSource).toBeDefined()
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-init-topology-"))
    const fakeBin = join(root, "bin")
    mkdirSync(fakeBin)
    writeFileSync(join(fakeBin, "ps"), "#!/bin/sh\nprintf '%s\\n' \"$MOBILE_QA_FAKE_PS\"\n")
    execFileSync("chmod", ["+x", join(fakeBin, "ps")])
    const idle = "1 0 Ss 12 docker-init /sbin/docker-init -- sleep infinity\n7 1 S 11 sleep sleep infinity"
    const invalidInventories = [
      ["extra sleep", `${idle}\n9 1 S 1 sleep sleep 30`, /sleep 30/],
      ["extra ps", `${idle}\n11 2 S 1 ps ps`, / ps ps/],
      ["extra awk", `${idle}\n12 2 S 1 awk awk`, / awk awk/],
      ["malformed pid", `${idle}\nnot-pid 2 S 1 node node`, /not-pid/],
      ["malformed ppid", `${idle}\n9 not-ppid S 1 node node`, /not-ppid/],
      ["basename init spoof", "1 0 Ss 12 docker-init /tmp/docker-init -- sleep infinity\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["extra init arg", "1 0 Ss 12 docker-init /sbin/docker-init -- extra sleep infinity\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["wrong init args", "1 0 Ss 12 docker-init /sbin/docker-init -- sleep forever\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["wrong sleep args", "1 0 Ss 12 docker-init /sbin/docker-init -- sleep infinity\n7 1 S 11 sleep sleep 30", /expected exactly one direct sleep/],
      ["wrong init comm", "1 0 Ss 12 sh /sbin/docker-init -- sleep infinity\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["zombie", `${idle}\n9 1 Z 1 node node`, /unexpected zombie/],
      ["nonnumeric age", "1 0 S not-age docker-init docker-init -- sleep infinity\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["implausible age", "1 0 S 9999999999 docker-init docker-init -- sleep infinity\n7 1 S 11 sleep sleep infinity", /unexpected init topology/],
      ["duplicate sleep", `${idle}\n9 1 S 1 sleep sleep infinity`, /found 2/],
      ["extra child", `${idle}\n9 7 S 1 node node`, /node node/],
    ] as const
    try {
      const baseEnv = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, MOBILE_QA_FAKE_PS: idle }
      expect(execFileSync("bash", ["-c", `${functionSource}\nunexpected_live_pids`], { env: baseEnv, encoding: "utf8" })).toBe("")
      for (const [, inventory, expected] of invalidInventories) {
        expect(execFileSync("bash", ["-c", `${functionSource}\nunexpected_live_pids`], { env: { ...baseEnv, MOBILE_QA_FAKE_PS: inventory }, encoding: "utf8" })).toMatch(expected)
      }
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  }, 10_000)

  it("enumerates inventory output and rejects browser evidence names", async () => {
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-inventory-"))
    try {
      mkdirSync(join(root, "orchestration"), { recursive: true })
      writeFileSync(join(root, "orchestration", "fast.inventory.json"), "{}")
      expect(() => assertInventoryArtifactTree(root)).not.toThrow()
      mkdirSync(join(root, "playwright-report"), { recursive: true })
      expect(() => assertInventoryArtifactTree(root)).toThrow(/browser evidence names/)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("rejects unsafe or out-of-range E2E ports before shell interpolation", () => {
    expect(validateMobileQaPort(undefined)).toBe("3112")
    expect(validateMobileQaPort("65535")).toBe("65535")
    expect(() => validateMobileQaPort("0")).toThrow(/1 to 65535/)
    expect(() => validateMobileQaPort("3112;touch /tmp/pwned")).toThrow(/decimal TCP port/)
    expect(() => validateMobileQaPort("65536")).toThrow(/1 to 65535/)
  })
})
