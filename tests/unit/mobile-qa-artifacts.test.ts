import { describe, expect, it, vi } from "vitest"
import {
  captureMobileQaArtifacts,
  copyMobileQaAttachments,
  ensureMobileQaArtifactDirectory,
  mobileQaArtifactPath,
  mobileQaArtifactRelativePath,
  mobileQaFinalScreenshotIsFullPage,
  safeArtifactName,
} from "../../tests/e2e/mobile-qa/artifacts"
import { shouldCaptureMobileQaFinalScreenshot } from "../../tests/e2e/mobile-qa/artifacts"
import { makeRoute } from "../../tests/e2e/helpers/planner-fixtures"
import { MOBILE_QA_SEED_PATH, ROUTE_LIBRARY_SEED_SCHEMA, savedRouteSeed } from "../../tests/e2e/mobile-qa/persistence-mobile-states"

describe("mobile QA artifact paths", () => {
  it("omits generic passing final captures unless full evidence is requested", () => {
    expect(shouldCaptureMobileQaFinalScreenshot("passed", "passed", false)).toBe(false)
    expect(shouldCaptureMobileQaFinalScreenshot("passed", "passed", true)).toBe(true)
    expect(shouldCaptureMobileQaFinalScreenshot("failed", "passed", false)).toBe(true)
    expect(shouldCaptureMobileQaFinalScreenshot("passed", "failed", false)).toBe(true)
  })
  it("keeps unexpected teardown captures to the viewport unless full evidence is explicit", () => {
    expect(mobileQaFinalScreenshotIsFullPage(false)).toBe(false)
    expect(mobileQaFinalScreenshotIsFullPage(true)).toBe(true)
  })
  it("passes viewport capture options for an unexpected failure", async () => {
    const screenshot = vi.fn().mockResolvedValue(undefined)
    await captureMobileQaArtifacts({ isClosed: () => false, screenshot } as never, {
      status: "failed",
      expectedStatus: "passed",
      project: { name: "unit-artifacts" },
      title: "unexpected teardown",
      attachments: [],
    } as never)
    expect(screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: false }))
  })
  it("creates stable, sanitized paths beneath the ignored artifact root", () => {
    expect(safeArtifactName("route / selected: iPhone")).toBe("route-selected-iPhone")
    expect(mobileQaArtifactRelativePath("screenshots", "webkit-standard", "home")).toBe(
      "screenshots/webkit-standard/home.png",
    )
    expect(mobileQaArtifactPath("traces", "webkit-standard", "home", "zip")).toContain(
      "/artifacts/mobile-qa/traces/webkit-standard/home.zip",
    )
  })

  it("creates the project directory before a clean-CI capture", () => {
    const destination = ensureMobileQaArtifactDirectory("screenshots", "unit-clean-project", "capture")
    expect(destination).toContain("/artifacts/mobile-qa/screenshots/unit-clean-project/capture.png")
  })

  it("uses the RouteLibrary v2 record shape for deterministic seeds", () => {
    expect(MOBILE_QA_SEED_PATH).toBe("/__mobile-qa-seed")
    const seed = savedRouteSeed(makeRoute("scenic", { id: "unit-route", name: "Unit route" }))
    expect(ROUTE_LIBRARY_SEED_SCHEMA).toEqual({
      databaseVersion: 2,
      storeName: "routes",
      indexNames: ["name", "profile", "folder", "tags", "visible", "createdAt", "updatedAt"],
    })
    expect(seed).toMatchObject({
      id: "unit-route",
      notes: "",
      folder: "Unfiled",
      tags: [],
      visible: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      previewOnly: false,
    })
  })

  it("does not fail when a test has no attachment paths to retain", async () => {
    await expect(copyMobileQaAttachments("unit-clean-project", "no-attachments", "failed", [])).resolves.toEqual([])
    await expect(copyMobileQaAttachments("unit-clean-project", "missing-path", "failed", [
      { name: "trace", contentType: "application/zip" },
    ])).resolves.toEqual([])
  })
})
