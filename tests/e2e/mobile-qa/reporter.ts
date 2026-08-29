import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter"
import { cleanMobileQaArtifacts, copyMobileQaAttachments, mobileQaArtifactRoot } from "./artifacts"

export type MobileQaProjectStatus = "passed" | "failed" | "not-run"

export interface MobileQaProjectReport {
  readonly name: string
  readonly status: MobileQaProjectStatus
  readonly tests: number
  readonly failures: number
}

export interface MobileQaChunkSummary {
  readonly chunkId: string
  readonly runId: string
  readonly projects: readonly (MobileQaProjectReport & { readonly skipped: number; readonly testIds: readonly string[] })[]
}

export interface MobileQaDiscovery {
  readonly runId: string
  readonly projects: readonly { readonly name: string; readonly tests: readonly { readonly id: string; readonly file: string; readonly title: string }[] }[]
}

export interface MobileQaReportInput {
  readonly fullStatus: FullResult["status"]
  readonly generatedAt: string
  readonly projects: readonly MobileQaProjectReport[]
}

export function assertMobileQaRunHasTests(
  projects: readonly MobileQaProjectReport[],
  expectedProjectNames: readonly string[] = projects.map((project) => project.name),
): void {
  const missing = expectedProjectNames.filter((name) => projects.find((project) => project.name === name)?.tests === 0)
  if (missing.length > 0) {
    throw new Error(`Mobile QA selected no tests for: ${missing.join(", ")}; refusing to report an empty run as valid`)
  }
}

function statusMark(status: MobileQaProjectStatus): string {
  if (status === "not-run") return "NOT RUN"
  return status === "passed" ? "PASS" : "FAIL"
}

function resultStatusMark(status: FullResult["status"]): string {
  return status === "passed" ? "PASS" : "FAIL"
}

function aggregate(projects: readonly MobileQaProjectReport[], predicate: (name: string) => boolean): MobileQaProjectStatus {
  const selected = projects.filter((project) => predicate(project.name))
  if (selected.length === 0 || selected.every((project) => project.status === "not-run")) return "not-run"
  return selected.some((project) => project.status === "failed") ? "failed" : "passed"
}

export function renderMobileQaReport(input: MobileQaReportInput): string {
  const emulation = aggregate(input.projects, () => true)
  const webkit = aggregate(input.projects, (name) => name.startsWith("webkit-"))
  const lines = [
    "# Mobile QA report",
    "",
    `Generated: ${input.generatedAt}`,
    `Playwright run: ${resultStatusMark(input.fullStatus)}`,
    "",
    "## Coverage boundaries",
    "",
    `| Boundary | Status |`,
    `| --- | --- |`,
    `| Mobile responsive emulation | ${statusMark(emulation)} |`,
    `| WebKit mobile approximation | ${statusMark(webkit)} |`,
    "| Real iOS Safari | NOT RUN |",
    "| Installed iOS PWA behavior | NOT RUN |",
    "",
    "## Projects",
    "",
    "| Project | Status | Tests | Failures |",
    "| --- | --- | ---: | ---: |",
    ...input.projects.map((project) => `| ${project.name} | ${statusMark(project.status)} | ${project.tests} | ${project.failures} |`),
    "",
    `Mobile responsive emulation: ${statusMark(emulation)}`,
    `WebKit mobile approximation: ${statusMark(webkit)}`,
    "Real iOS Safari: NOT RUN",
    "Installed iOS PWA behavior: NOT RUN",
    "",
    "Physical-device coverage is intentionally reported separately and is not inferred from WebKit emulation.",
    "",
  ]
  return lines.join("\n")
}

interface MutableProjectReport {
  readonly name: string
  status: MobileQaProjectStatus
  tests: number
  failures: number
  skipped: number
  readonly testIds: string[]
}

function writeAtomic(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, contents, "utf8")
  renameSync(temporaryPath, filePath)
}

function projectName(test: TestCase): string | undefined {
  return test.parent.project()?.name
}

function expectedProjectsFromEnvironment(): readonly string[] | undefined {
  const expected = process.env.MOBILE_QA_EXPECTED_PROJECTS?.split(",").filter(Boolean)
  return expected && expected.length > 0 ? expected : undefined
}

export class MobileQaReporter implements Reporter {
  private projects: MutableProjectReport[] = []

  onBegin(_config: FullConfig, suite: Suite): void {
    if (process.env.MOBILE_QA_PRESERVE_ARTIFACTS !== "1") cleanMobileQaArtifacts()
    const selectedTests = suite.allTests()
    const names = new Set(selectedTests.map(projectName).filter((name): name is string => name !== undefined))
    this.projects = [...names].map((name) => ({ name, status: "not-run", tests: 0, failures: 0, skipped: 0, testIds: [] }))
    const discoveryPath = process.env.MOBILE_QA_DISCOVERY_PATH
    if (discoveryPath) {
      const projects = [...names].map((name) => {
        const tests = selectedTests.filter((test) => projectName(test) === name)
        return {
          name,
          tests: tests.map((test) => ({ id: test.id, file: path.relative(process.cwd(), test.location.file), title: test.title })),
        }
      })
      writeAtomic(discoveryPath, JSON.stringify({ runId: process.env.MOBILE_QA_RUN_ID ?? "single-run", projects }, null, 2) + "\n")
    }
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const name = test.parent.project()?.name
    if (name === undefined) return
    await copyMobileQaAttachments(name, test.title, result.status, result.attachments)
    let project = this.projects.find((candidate) => candidate.name === name)
    if (project === undefined) {
      project = { name, status: "not-run", tests: 0, failures: 0, skipped: 0, testIds: [] }
      this.projects.push(project)
    }
    project.testIds.push(test.id)
    project.tests += 1
    if (result.status === "skipped") project.skipped += 1
    if (result.status !== "passed" && result.status !== "skipped") {
      project.failures += 1
      project.status = "failed"
    } else if (project.status !== "failed" && result.status === "passed") {
      project.status = "passed"
    }
  }

  onEnd(result: FullResult): void {
    const report = renderMobileQaReport({
      fullStatus: result.status,
      generatedAt: new Date().toISOString(),
      projects: this.projects,
    })
    const root = mobileQaArtifactRoot()
    const reportPath = process.env.MOBILE_QA_CHUNK_REPORT ?? path.join(root, "MOBILE-QA-REPORT.md")
    writeAtomic(reportPath, report)
    const summaryPath = process.env.MOBILE_QA_CHUNK_SUMMARY
    if (summaryPath) {
      mkdirSync(path.dirname(summaryPath), { recursive: true })
      const summary: MobileQaChunkSummary = {
        chunkId: process.env.MOBILE_QA_CHUNK_ID ?? "single-run",
        runId: process.env.MOBILE_QA_RUN_ID ?? "single-run",
        projects: this.projects.map((project) => ({ ...project, testIds: project.testIds })),
      }
      writeAtomic(summaryPath, JSON.stringify(summary, null, 2) + "\n")
    }
    const expectedProjects = expectedProjectsFromEnvironment()
    if (expectedProjects && !process.argv.includes("--list")) {
      const actual = [...new Set(this.projects.map((project) => project.name))].sort()
      const expected = [...new Set(expectedProjects)].sort()
      if (actual.join(",") !== expected.join(",")) {
        throw new Error(`Mobile QA selected projects ${actual.join(",") || "none"}; expected ${expected.join(",")}`)
      }
      assertMobileQaRunHasTests(this.projects, expectedProjects)
    }
  }

  printsToStdio(): boolean {
    return false
  }
}

export default MobileQaReporter
