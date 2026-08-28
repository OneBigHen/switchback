import { spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const MOBILE_QA_REPORT_ROOT = path.resolve(process.cwd(), "artifacts", "mobile-qa")

interface FastRunMetadata {
  readonly generatedAt?: string
  readonly mode?: string
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

function isFastRun(candidate: string): boolean {
  if (!isDirectory(candidate)) return false
  try {
    const metadata = JSON.parse(readFileSync(path.join(candidate, "MOBILE-QA-FAST-RUN.json"), "utf8")) as FastRunMetadata
    return metadata.mode === "browser" && typeof metadata.generatedAt === "string" && existsSync(path.join(candidate, "MOBILE-QA-REPORT.md")) && isDirectory(reportHtmlPath(candidate))
  } catch {
    return false
  }
}

export function reportHtmlPath(runRoot: string): string {
  const resolvedRoot = path.resolve(runRoot)
  const candidate = path.join(resolvedRoot, "playwright-report", "chromium-core")
  if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Mobile QA report path escaped its run root")
  return candidate
}

export function findLatestFastRun(root = MOBILE_QA_REPORT_ROOT): string {
  const runsRoot = path.join(root, "runs")
  const candidates = readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runsRoot, entry.name))
    .filter(isFastRun)
    .sort((left, right) => {
      const readDate = (run: string): number => {
        try {
          return Date.parse((JSON.parse(readFileSync(path.join(run, "MOBILE-QA-FAST-RUN.json"), "utf8")) as FastRunMetadata).generatedAt ?? "")
        } catch {
          return 0
        }
      }
      return readDate(right) - readDate(left)
    })
  const latest = candidates[0]
  if (!latest) throw new Error(`No complete FAST mobile QA run found under ${runsRoot}`)
  return latest
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const runRoot = findLatestFastRun()
  process.stdout.write(`Mobile QA FAST report: ${runRoot}\n`)
  const child = spawn("playwright", ["show-report", reportHtmlPath(runRoot)], { stdio: "inherit" })
  child.once("error", () => { process.exitCode = 1 })
  child.once("close", (code) => { process.exitCode = code ?? 1 })
}
