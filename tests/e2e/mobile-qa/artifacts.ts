import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import type { Page, TestInfo } from "@playwright/test"
import type { TestResult } from "@playwright/test/reporter"

export const MOBILE_QA_ARTIFACT_ROOT = path.resolve(process.cwd(), "artifacts", "mobile-qa")

export function mobileQaArtifactRoot(): string {
  return path.resolve(process.env.MOBILE_QA_ARTIFACT_ROOT ?? MOBILE_QA_ARTIFACT_ROOT)
}

export type MobileQaArtifactKind = "screenshots" | "failures" | "traces" | "videos"

export function shouldCaptureMobileQaFinalScreenshot(
  status: TestResult["status"] | undefined,
  expectedStatus: TestResult["status"],
  fullEvidence: boolean,
): boolean {
  return fullEvidence || status !== expectedStatus
}

export function mobileQaFinalScreenshotIsFullPage(fullEvidence: boolean): boolean {
  return fullEvidence
}

const MOBILE_QA_OWNED_PATHS = [
  "screenshots",
  "failures",
  "traces",
  "videos",
  "playwright-report",
  "test-results",
  "MOBILE-QA-REPORT.md",
  "MOBILE-QA-FAST-SUMMARY.md",
  "MOBILE-QA-FAST-RUN.json",
  "MOBILE-QA-FAST-INVENTORY.md",
  "MOBILE-QA-FAST-INVENTORY.json",
  "orchestration",
] as const

export function safeArtifactName(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
  return sanitized || "unnamed"
}

export function mobileQaArtifactRelativePath(
  kind: MobileQaArtifactKind,
  projectName: string,
  name: string,
  extension = "png",
): string {
  return path.posix.join(kind, safeArtifactName(projectName), `${safeArtifactName(name)}.${safeArtifactName(extension)}`)
}

export function mobileQaArtifactPath(
  kind: MobileQaArtifactKind,
  projectName: string,
  name: string,
  extension = "png",
  root = mobileQaArtifactRoot(),
): string {
  return path.join(root, mobileQaArtifactRelativePath(kind, projectName, name, extension))
}

export function ensureMobileQaArtifactDirectories(root = mobileQaArtifactRoot()): void {
  for (const kind of ["screenshots", "failures", "traces", "videos"] as const) {
    mkdirSync(path.join(root, kind), { recursive: true })
  }
}

export function cleanMobileQaArtifacts(root = mobileQaArtifactRoot(), createArtifactDirectories = true): void {
  for (const relativePath of MOBILE_QA_OWNED_PATHS) {
    rmSync(path.join(root, relativePath), { force: true, recursive: true })
  }
  if (createArtifactDirectories) ensureMobileQaArtifactDirectories(root)
}

export function ensureMobileQaArtifactDirectory(
  kind: MobileQaArtifactKind,
  projectName: string,
  name: string,
  extension = "png",
  root = mobileQaArtifactRoot(),
): string {
  const destination = mobileQaArtifactPath(kind, projectName, name, extension, root)
  mkdirSync(path.dirname(destination), { recursive: true })
  return destination
}

async function waitForSettledFile(filePath: string): Promise<boolean> {
  let previousSize: number | undefined
  let previousModified: number | undefined
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stats = statSync(filePath, { throwIfNoEntry: false })
    if (stats?.isFile()) {
      if (stats.size > 0 && stats.size === previousSize && stats.mtimeMs === previousModified) return true
      previousSize = stats.size
      previousModified = stats.mtimeMs
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  const finalStats = statSync(filePath, { throwIfNoEntry: false })
  return Boolean(finalStats?.isFile() && finalStats.size > 0)
}

export async function copyMobileQaAttachments(
  projectName: string,
  testTitle: string,
  status: TestResult["status"],
  attachments: readonly TestResult["attachments"][number][],
): Promise<string[]> {
  const copied: string[] = []
  for (const attachment of attachments) {
    if (attachment.path === undefined) continue
    const attachmentName = attachment.name.toLowerCase()
    const isTrace = attachmentName.includes("trace")
    const isVideo = attachmentName.includes("video")
    const isScreenshot = attachmentName.includes("screenshot")
    if (!isTrace && !isVideo && !(isScreenshot && status !== "passed" && status !== "skipped")) continue
    const kind = isTrace ? "traces" : isVideo ? "videos" : "failures"
    const extension = isTrace ? "zip" : isVideo ? "webm" : "png"
    if (!await waitForSettledFile(attachment.path)) continue
    const destination = ensureMobileQaArtifactDirectory(kind, projectName, `${testTitle}-${attachment.name}`, extension)
    copyFileSync(attachment.path, destination)
    copied.push(destination)
  }
  return copied
}

export async function captureMobileQaArtifacts(page: Page, testInfo: TestInfo): Promise<void> {
  const shouldCapture = shouldCaptureMobileQaFinalScreenshot(
    testInfo.status,
    testInfo.expectedStatus,
    process.env.MOBILE_QA_FULL_EVIDENCE === "1",
  )
  if (!shouldCapture) return
  const fullPage = mobileQaFinalScreenshotIsFullPage(process.env.MOBILE_QA_FULL_EVIDENCE === "1")
  ensureMobileQaArtifactDirectories()
  const screenshotName = `${testInfo.title}-final`
  if (!page.isClosed()) {
    const screenshotPath = ensureMobileQaArtifactDirectory("screenshots", testInfo.project.name, screenshotName)
    await page.screenshot({
      path: screenshotPath,
      fullPage,
      animations: "disabled",
    })
    if (testInfo.status !== testInfo.expectedStatus) {
      const failurePath = ensureMobileQaArtifactDirectory("failures", testInfo.project.name, testInfo.title)
      await page.screenshot({
        path: failurePath,
        fullPage,
        animations: "disabled",
      })
    }
  }
}
