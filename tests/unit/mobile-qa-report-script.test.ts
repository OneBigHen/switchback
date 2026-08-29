import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { findLatestFastRun, reportHtmlPath } from "../../scripts/qa/report-mobile-qa"

describe("mobile QA report resolver", () => {
  it("selects the newest complete FAST run and its HTML report", () => {
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-reports-"))
    try {
      const oldRun = join(root, "runs", "old")
      const newRun = join(root, "runs", "new")
      mkdirSync(join(oldRun, "playwright-report", "chromium-core"), { recursive: true })
      mkdirSync(join(newRun, "playwright-report", "chromium-core"), { recursive: true })
      writeFileSync(join(oldRun, "MOBILE-QA-FAST-RUN.json"), JSON.stringify({ mode: "browser", generatedAt: "2026-08-28T10:00:00.000Z" }))
      writeFileSync(join(newRun, "MOBILE-QA-FAST-RUN.json"), JSON.stringify({ mode: "inventory", generatedAt: "2026-08-28T11:00:00.000Z" }))
      writeFileSync(join(oldRun, "MOBILE-QA-REPORT.md"), "old")
      writeFileSync(join(newRun, "MOBILE-QA-REPORT.md"), "new")
      expect(findLatestFastRun(root)).toBe(oldRun)
      expect(reportHtmlPath(newRun)).toBe(join(newRun, "playwright-report", "chromium-core"))
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("errors cleanly when no completed browser FAST run exists", () => {
    const root = mkdtempSync(join(tmpdir(), "mobile-qa-empty-reports-"))
    try {
      mkdirSync(join(root, "runs"), { recursive: true })
      expect(() => findLatestFastRun(root)).toThrow(/No complete FAST mobile QA run/)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
