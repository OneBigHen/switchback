#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..")
const qualityDirectory = resolve(root, "artifacts/quality")
mkdirSync(qualityDirectory, { recursive: true })

function normalizeStatus(value) {
  if (["success", "PASS", "pass"].includes(value)) return "PASS"
  if (["failure", "FAIL", "fail"].includes(value)) return "FAIL"
  // A cancelled/timed-out workflow (e.g. concurrency superseded a run) is
  // not a product failure: never surface it as NEEDS YOUR DECISION.
  if (["cancelled", "timed_out"].includes(value)) return "NOT RUN"
  if (["skipped", "NOT RUN", "not-run"].includes(value)) return "NOT RUN"
  return value || "NOT RUN"
}

const quickResultsPath = resolve(qualityDirectory, "latest/results.json")
let quickResults = null
if (existsSync(quickResultsPath)) {
  try {
    quickResults = JSON.parse(readFileSync(quickResultsPath, "utf8"))
  } catch {
    quickResults = null
  }
}

const quickStatus = (id) => normalizeStatus(
  quickResults?.results?.find((result) => result.id === id)?.status
)

const gates = {
  "code-quality": normalizeStatus(process.env.QUALITY_CODE_QUALITY) === "NOT RUN"
    ? (quickStatus("lint") === "PASS" && quickStatus("typecheck") === "PASS" && quickStatus("unit") === "PASS" ? "PASS" : "NOT RUN")
    : normalizeStatus(process.env.QUALITY_CODE_QUALITY),
  "critical-browser": normalizeStatus(process.env.QUALITY_CRITICAL_BROWSER),
  "real-router": normalizeStatus(process.env.QUALITY_REAL_ROUTER),
  pwa: normalizeStatus(process.env.QUALITY_PWA),
  "live-smoke": liveSmokeStatus()
}

// The live-smoke job can legitimately exit 0 with zero endpoints configured
// (CI has no local routers), so its raw job result is not an honest PASS.
// Derive the summary from the report artifact the job uploaded; fall back to
// the job result only when the artifact is missing (e.g. job cancelled).
function liveSmokeStatus() {
  const reportPath = resolve(qualityDirectory, "live-provider-results.json")
  if (existsSync(reportPath)) {
    try {
      const report = JSON.parse(readFileSync(reportPath, "utf8"))
      const checks = Array.isArray(report.checks) ? report.checks : []
      const attempted = checks.filter((check) => check.status !== "NOT CONFIGURED")
      if (attempted.length === 0) return "NOT RUN"
      return attempted.some((check) => check.status === "FAIL") ? "FAIL" : "PASS"
    } catch {
      // Unreadable artifact: report what the job itself did.
    }
  }
  // No report artifact (e.g. download failed or job cancelled): only a
  // reported failure is meaningful; never claim a live pass we cannot verify.
  return normalizeStatus(process.env.QUALITY_LIVE_SMOKE) === "FAIL" ? "FAIL" : "NOT RUN"
}

const requiredGates = ["code-quality", "critical-browser", "real-router", "pwa"]
const failedRequired = requiredGates.filter((gate) => gates[gate] === "FAIL")
const unfinishedRequired = requiredGates.filter((gate) => gates[gate] !== "PASS")
const state = failedRequired.length > 0
  ? "NEEDS YOUR DECISION"
  : unfinishedRequired.length > 0
    ? "AGENT WORKING"
    : "READY TO MERGE"

const live = gates["live-smoke"] === "NOT RUN" ? "not run" : gates["live-smoke"].toLowerCase()
const physicalNote = "Physical iPhone drill remains explicitly pending; no device result is inferred."
const nextAction = state === "READY TO MERGE"
  ? "Owner may merge after reviewing the concise evidence index."
  : state === "NEEDS YOUR DECISION"
    ? `Review the failed required gate(s): ${failedRequired.join(", ")}.`
    : "The agent should continue the remaining required gates."

const lines = [
  `# Quality summary`,
  ``,
  `**${state}**`,
  ``,
  `Required automated gates: ${requiredGates.map((gate) => `${gate}=${gates[gate]}`).join(" · ")}`,
  `Live provider smoke: ${live}.`,
  physicalNote,
  ``,
  `Next action: ${nextAction}`,
  ``
]
const markdown = lines.join("\n")
writeFileSync(resolve(qualityDirectory, "QUALITY_SUMMARY.md"), markdown)
writeFileSync(resolve(qualityDirectory, "summary.json"), `${JSON.stringify({ state, gates, generatedAt: new Date().toISOString() }, null, 2)}\n`)
console.log(markdown.trim())
