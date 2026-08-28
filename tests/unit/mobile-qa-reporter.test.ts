import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assertMobileQaRunHasTests, MobileQaReporter, renderMobileQaReport, type MobileQaReportInput } from "../../tests/e2e/mobile-qa/reporter"

describe("mobile QA report", () => {
  it("keeps emulation, approximation, and unrun physical paths distinct", () => {
    const reportInput: MobileQaReportInput = {
      fullStatus: "passed",
      generatedAt: "2026-08-27T12:00:00.000Z",
      projects: [
        { name: "webkit-standard", status: "passed", tests: 2, failures: 0 },
        { name: "chromium-standard", status: "passed", tests: 2, failures: 0 },
      ],
    }
    const report = renderMobileQaReport(reportInput)
    expect(report).toContain("Mobile responsive emulation")
    expect(report).toContain("WebKit mobile approximation")
    expect(report).toContain("Real iOS Safari | NOT RUN")
    expect(report).toContain("Installed iOS PWA behavior | NOT RUN")
    expect(report).toContain("webkit-standard")
    expect(report).toContain("| WebKit mobile approximation | PASS |")
    expect(report).not.toContain("PASSED")
    expect(report).toContain("Mobile responsive emulation: PASS")
    expect(report).toContain("WebKit mobile approximation: PASS")
    expect(report).toContain("Real iOS Safari: NOT RUN")
    expect(report).toContain("Installed iOS PWA behavior: NOT RUN")
  })

  it("fails an empty selected run instead of accepting zero tests", () => {
    expect(() => assertMobileQaRunHasTests([
      { name: "webkit-standard", status: "not-run", tests: 0, failures: 0 },
    ])).toThrow(/selected no tests/)
  })

  it("fails when an expected project contributes no tests", () => {
    expect(() => assertMobileQaRunHasTests([
      { name: "webkit-standard", status: "passed", tests: 4, failures: 0 },
      { name: "chromium-standard", status: "not-run", tests: 0, failures: 0 },
    ], ["webkit-standard", "chromium-standard"])).toThrow(/chromium-standard/)
  })

  it("retains the owned artifact directories for a fresh run", async () => {
    const { cleanMobileQaArtifacts } = await import("../../tests/e2e/mobile-qa/artifacts")
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-artifacts-"))
    try {
      mkdirSync(join(root, "screenshots", "old"), { recursive: true })
      writeFileSync(join(root, "screenshots", "old", "stale.png"), "stale")
      writeFileSync(join(root, "unowned.txt"), "keep")
      cleanMobileQaArtifacts(root)
      expect(existsSync(join(root, "screenshots", "old", "stale.png"))).toBe(false)
      expect(existsSync(join(root, "unowned.txt"))).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("derives selected projects and IDs from the filtered root suite", () => {
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-discovery-"))
    const previousRoot = process.env.MOBILE_QA_ARTIFACT_ROOT
    const previousDiscovery = process.env.MOBILE_QA_DISCOVERY_PATH
    try {
      process.env.MOBILE_QA_ARTIFACT_ROOT = root
      process.env.MOBILE_QA_RUN_ID = "unit-run"
      process.env.MOBILE_QA_DISCOVERY_PATH = join(root, "discovery.json")
      const test = (id: string) => ({ id, title: id, location: { file: join(process.cwd(), "tests/e2e/mobile-qa/core/ride.core.spec.ts") }, parent: { project: () => ({ name: "webkit-standard" }) } })
      const suite = { allTests: () => [test("webkit-id-1"), test("webkit-id-2")] }
      new MobileQaReporter().onBegin({} as never, suite as never)
      const discovery = JSON.parse(readFileSync(join(root, "discovery.json"), "utf8")) as { projects: { name: string; tests: { id: string }[] }[] }
      expect(discovery.projects).toEqual([{ name: "webkit-standard", tests: [{ id: "webkit-id-1", file: "tests/e2e/mobile-qa/core/ride.core.spec.ts", title: "webkit-id-1" }, { id: "webkit-id-2", file: "tests/e2e/mobile-qa/core/ride.core.spec.ts", title: "webkit-id-2" }] }])
    } finally {
      if (previousRoot === undefined) delete process.env.MOBILE_QA_ARTIFACT_ROOT
      else process.env.MOBILE_QA_ARTIFACT_ROOT = previousRoot
      if (previousDiscovery === undefined) delete process.env.MOBILE_QA_DISCOVERY_PATH
      else process.env.MOBILE_QA_DISCOVERY_PATH = previousDiscovery
      delete process.env.MOBILE_QA_RUN_ID
      rmSync(root, { force: true, recursive: true })
    }
  })
})
