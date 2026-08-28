import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  cleanMobileQaArtifacts,
  mobileQaArtifactRoot,
} from "../../tests/e2e/mobile-qa/artifacts"
import {
  renderMobileQaReport,
  type MobileQaProjectReport,
} from "../../tests/e2e/mobile-qa/reporter"

export const FAST_EXPECTED_TESTS = 50
export const FAST_EXPECTED_FILES = 5

const CORE_ROOT = "tests/e2e/mobile-qa/core"
const LIBRARY = `${CORE_ROOT}/library-settings.core.spec.ts`
const OFFLINE = `${CORE_ROOT}/offline.core.spec.ts`
const PLANNER = `${CORE_ROOT}/planner.core.spec.ts`
const RIDE = `${CORE_ROOT}/ride.core.spec.ts`
const SCROLL = `${CORE_ROOT}/scroll-owner.core.spec.ts`
const FREE_RIDE_SUGGESTION_TITLE = "Free Ride suggestion is reachable by touch and can enter guidance"

export interface MobileQaChunk {
  readonly id: string
  readonly project: "webkit-standard" | "chromium-standard"
  readonly files: readonly string[]
  readonly testCount: number
  readonly grep?: string
  readonly grepInvert?: string
  readonly testTitle?: string
  readonly excludedTestTitle?: string
}

export const MOBILE_QA_CHUNKS: readonly MobileQaChunk[] = [
  { id: "webkit-core", project: "webkit-standard", files: [LIBRARY, OFFLINE, PLANNER, SCROLL], testCount: 18 },
  { id: "webkit-free-ride-suggestion", project: "webkit-standard", files: [RIDE], testCount: 1, grep: FREE_RIDE_SUGGESTION_TITLE, testTitle: FREE_RIDE_SUGGESTION_TITLE },
  { id: "webkit-ride", project: "webkit-standard", files: [RIDE], testCount: 6, grepInvert: FREE_RIDE_SUGGESTION_TITLE, excludedTestTitle: FREE_RIDE_SUGGESTION_TITLE },
  { id: "chromium-core", project: "chromium-standard", files: [LIBRARY, OFFLINE, PLANNER, RIDE, SCROLL], testCount: 25 },
]

export interface MobileQaChunkProjectResult {
  readonly name: string
  readonly status: "passed" | "failed" | "not-run"
  readonly tests: number
  readonly failures: number
  readonly skipped: number
  readonly testIds: readonly string[]
}

export interface MobileQaChunkResult {
  readonly chunkId: string
  readonly exitCode: number
  readonly projects: readonly MobileQaChunkProjectResult[]
}

export interface MobileQaFastSummary {
  readonly exitCode: number
  readonly totalTests: number
  readonly totalFiles: number
  readonly failedChunks: readonly string[]
}

export function renderMobileQaInventory(summary: MobileQaFastSummary): string {
  return [
    "# Mobile QA FAST inventory",
    "",
    "Mode: INVENTORY (NOT RUN)",
    `Coverage: ${summary.totalTests}/${FAST_EXPECTED_TESTS} tests in ${summary.totalFiles}/${FAST_EXPECTED_FILES} files`,
    `Chunks: ${summary.failedChunks.length === 0 ? MOBILE_QA_CHUNKS.length : MOBILE_QA_CHUNKS.length - summary.failedChunks.length}/${MOBILE_QA_CHUNKS.length}`,
    "",
  ].join("\n")
}

export interface MobileQaDiscoveryProject {
  readonly name: string
  readonly tests: readonly { readonly id: string; readonly file: string; readonly title: string }[]
}

export interface MobileQaDiscovery {
  readonly runId: string
  readonly projects: readonly MobileQaDiscoveryProject[]
}

export function buildChunkArgs(chunk: MobileQaChunk, list = false): readonly string[] {
  return [
    "test",
    "--config=playwright.mobile.config.ts",
    `--project=${chunk.project}`,
    "--workers=1",
    "--retries=0",
    ...(chunk.grep ? [`--grep=${chunk.grep}`] : []),
    ...(chunk.grepInvert ? [`--grep-invert=${chunk.grepInvert}`] : []),
    ...(list ? ["--list"] : []),
    ...chunk.files,
  ]
}

export function buildDiscoveryArgs(): readonly string[] {
  return [
    "test",
    "--config=playwright.mobile.config.ts",
    "--project=webkit-standard",
    "--project=chromium-standard",
    "--workers=1",
    "--retries=0",
    "--list",
    LIBRARY,
    OFFLINE,
    PLANNER,
    RIDE,
    SCROLL,
  ]
}

export function formatDryRunPlan(list = false): readonly string[] {
  return [
    `discovery: playwright ${buildDiscoveryArgs().join(" ")}`,
    ...MOBILE_QA_CHUNKS.map((chunk) => `${chunk.id}: playwright ${buildChunkArgs(chunk, list).join(" ")}`),
  ]
}

export const MAX_RETAINED_PROCESS_OUTPUT = 64 * 1024

export function appendBoundedProcessOutput(current: string, next: string, limit = MAX_RETAINED_PROCESS_OUTPUT): string {
  if (limit <= 0) return ""
  const combined = current + next
  return combined.length <= limit ? combined : combined.slice(-limit)
}

function expectedChunk(id: string): MobileQaChunk {
  const chunk = MOBILE_QA_CHUNKS.find((candidate) => candidate.id === id)
  if (!chunk) throw new Error(`Unknown mobile QA chunk: ${id}`)
  return chunk
}

export function validateFastCoverage(results: readonly MobileQaChunkResult[]): void {
  if (results.length !== MOBILE_QA_CHUNKS.length) {
    throw new Error(`Mobile QA expected ${MOBILE_QA_CHUNKS.length} chunks, received ${results.length}`)
  }
  const seenChunkIds = new Set<string>()
  const seenTestKeys = new Set<string>()
  let totalTests = 0
  for (const result of results) {
    if (seenChunkIds.has(result.chunkId)) throw new Error(`Mobile QA duplicate chunk: ${result.chunkId}`)
    seenChunkIds.add(result.chunkId)
    const expected = expectedChunk(result.chunkId)
    if (result.projects.length !== 1 || result.projects[0]?.name !== expected.project) {
      throw new Error(`Mobile QA chunk ${result.chunkId} selected an unexpected project`)
    }
    const project = result.projects[0]
    if (!project || project.tests !== expected.testCount) {
      throw new Error(`Mobile QA chunk ${result.chunkId} selected ${project?.tests ?? 0}; expected ${expected.testCount}`)
    }
    if (project.skipped !== 0) throw new Error(`Mobile QA chunk ${result.chunkId} skipped ${project.skipped} tests`)
    if (project.testIds.length !== project.tests) throw new Error(`Mobile QA chunk ${result.chunkId} has an unexpected test ID count`)
    const localKeys = new Set(project.testIds)
    if (localKeys.size !== project.testIds.length) throw new Error(`Mobile QA chunk ${result.chunkId} has duplicate test IDs`)
    for (const id of localKeys) {
      const key = `${project.name}:${id}`
      if (seenTestKeys.has(key)) throw new Error(`Mobile QA duplicate test ID: ${key}`)
      seenTestKeys.add(key)
    }
    totalTests += project.tests
  }
  if (seenChunkIds.size !== MOBILE_QA_CHUNKS.length || totalTests !== FAST_EXPECTED_TESTS) {
    throw new Error(`Mobile QA coverage is incomplete: ${totalTests}/${FAST_EXPECTED_TESTS} tests`)
  }
}

export function summarizeChunkResults(results: readonly MobileQaChunkResult[]): MobileQaFastSummary {
  const totalTests = results.reduce((total, result) => total + (result.projects[0]?.tests ?? 0), 0)
  return {
    exitCode: results.some((result) => result.exitCode !== 0) ? 1 : 0,
    totalTests,
    totalFiles: FAST_EXPECTED_FILES,
    failedChunks: results.filter((result) => result.exitCode !== 0).map((result) => result.chunkId),
  }
}

function atomicWrite(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, contents, "utf8")
  renameSync(temporaryPath, filePath)
}

function discoveryPath(root: string, id: string): string {
  return path.join(root, "orchestration", `${id}.discovery.inventory.json`)
}

function chunkSummaryPath(root: string, chunk: MobileQaChunk, inventory: boolean): string {
  return path.join(root, "orchestration", `${chunk.id}.${inventory ? "inventory.summary" : "summary"}.json`)
}

function readChunkResult(root: string, chunk: MobileQaChunk, exitCode: number): MobileQaChunkResult {
  try {
    const parsed: unknown = JSON.parse(readFileSync(chunkSummaryPath(root, chunk, false), "utf8"))
    if (typeof parsed !== "object" || parsed === null || !("projects" in parsed)) throw new Error("invalid chunk summary")
    const projects = parsed.projects
    if (!Array.isArray(projects)) throw new Error("invalid chunk projects")
    return { chunkId: chunk.id, exitCode, projects: projects as MobileQaChunkProjectResult[] }
  } catch {
    return { chunkId: chunk.id, exitCode: exitCode || 1, projects: [{ name: chunk.project, status: "not-run", tests: 0, failures: 1, skipped: 0, testIds: [] }] }
  }
}

function writeAggregate(root: string, results: readonly MobileQaChunkResult[], summary: MobileQaFastSummary, runId: string, fullDiscovery?: MobileQaDiscovery): void {
  const generatedAt = new Date().toISOString()
  const projects: MobileQaProjectReport[] = results.flatMap((result) => result.projects.map((project) => ({
    name: project.name,
    status: project.status,
    tests: project.tests,
    failures: project.failures,
  })))
  atomicWrite(path.join(root, "MOBILE-QA-REPORT.md"), renderMobileQaReport({
    fullStatus: summary.exitCode === 0 ? "passed" : "failed",
    generatedAt,
    projects,
  }))
  atomicWrite(path.join(root, "MOBILE-QA-FAST-SUMMARY.md"), [
    "# Mobile QA FAST summary",
    "",
    `Status: ${summary.exitCode === 0 ? "PASS" : "FAIL"}`,
    `Coverage: ${summary.totalTests}/${FAST_EXPECTED_TESTS} tests in ${summary.totalFiles}/${FAST_EXPECTED_FILES} files`,
    `Chunks: ${results.length}/${MOBILE_QA_CHUNKS.length}`,
    `Failed chunks: ${summary.failedChunks.length === 0 ? "none" : summary.failedChunks.join(", ")}`,
    "",
  ].join("\n"))
  atomicWrite(path.join(root, "MOBILE-QA-FAST-RUN.json"), JSON.stringify({
    runId,
    mode: "browser",
    generatedAt,
    expected: { tests: FAST_EXPECTED_TESTS, files: FAST_EXPECTED_FILES },
    discovery: fullDiscovery ?? null,
    summary,
    chunks: results,
  }, null, 2) + "\n")
}

function writeInventory(root: string, results: readonly MobileQaChunkResult[], summary: MobileQaFastSummary, runId: string, fullDiscovery?: MobileQaDiscovery): void {
  atomicWrite(path.join(root, "MOBILE-QA-FAST-INVENTORY.md"), renderMobileQaInventory(summary))
  atomicWrite(path.join(root, "MOBILE-QA-FAST-INVENTORY.json"), JSON.stringify({
    runId,
    mode: "inventory",
    expected: { tests: FAST_EXPECTED_TESTS, files: FAST_EXPECTED_FILES },
    summary,
    discovery: fullDiscovery ?? null,
    chunks: results,
  }, null, 2) + "\n")
}

const FORBIDDEN_INVENTORY_NAMES = new Set(["MOBILE-QA-REPORT.md", "playwright-report", "screenshots", "failures", "traces", "videos", "test-results"])

export function assertInventoryArtifactTree(root: string): void {
  const violations: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (FORBIDDEN_INVENTORY_NAMES.has(entry.name)) violations.push(path.relative(root, entryPath))
      if (entry.isDirectory()) visit(entryPath)
    }
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) visit(root)
  if (violations.length > 0) throw new Error(`Inventory produced browser evidence names: ${violations.join(", ")}`)
}

export interface MobileQaChunkProcessResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

export type MobileQaChunkRunner = (chunk: MobileQaChunk, list: boolean, root: string) => Promise<MobileQaChunkProcessResult>

export interface MobileQaOwnedProcessIdentity {
  readonly pid: number
  readonly startTime: string
  readonly token: string
}

const PROCESS_TOKEN_ENV = "MOBILE_QA_PROCESS_TOKEN"

function readProcessIdentity(pid: number, token: string): MobileQaOwnedProcessIdentity | undefined {
  if (process.platform !== "linux" || pid <= 1) return undefined
  try {
    const environment = readFileSync(`/proc/${pid}/environ`)
    if (!environment.toString("utf8").split("\0").includes(`${PROCESS_TOKEN_ENV}=${token}`)) return undefined
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const closingParenthesis = stat.lastIndexOf(")")
    if (closingParenthesis < 0) return undefined
    const fields = stat.slice(closingParenthesis + 2).trim().split(/\s+/)
    if (fields[0] === "Z" || fields[19] === undefined) return undefined
    return { pid, startTime: fields[19], token }
  } catch {
    return undefined
  }
}

export function enumerateOwnedProcessIdentities(token: string): readonly MobileQaOwnedProcessIdentity[] {
  if (!/^[a-zA-Z0-9._-]{16,128}$/.test(token) || process.platform !== "linux") return []
  let entries: string[]
  try {
    entries = readdirSync("/proc")
  } catch {
    return []
  }
  return entries
    .filter((entry) => /^\d+$/.test(entry))
    .map((entry) => readProcessIdentity(Number(entry), token))
    .filter((identity): identity is MobileQaOwnedProcessIdentity => identity !== undefined)
}

function sameProcessIdentity(left: MobileQaOwnedProcessIdentity, right: MobileQaOwnedProcessIdentity): boolean {
  return left.pid === right.pid && left.startTime === right.startTime && left.token === right.token
}

function signalOwnedProcesses(token: string, signal: NodeJS.Signals): void {
  for (const captured of enumerateOwnedProcessIdentities(token)) {
    const current = readProcessIdentity(captured.pid, token)
    if (!current || !sameProcessIdentity(captured, current)) continue
    try { process.kill(current.pid, signal) } catch { /* process exited between validation and signaling */ }
  }
}

export async function cleanupOwnedProcesses(token: string): Promise<void> {
  signalOwnedProcesses(token, "SIGTERM")
  const termDeadline = Date.now() + 5_000
  while (enumerateOwnedProcessIdentities(token).length > 0 && Date.now() < termDeadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  if (enumerateOwnedProcessIdentities(token).length === 0) return
  signalOwnedProcesses(token, "SIGKILL")
  const killDeadline = Date.now() + 1_000
  while (enumerateOwnedProcessIdentities(token).length > 0 && Date.now() < killDeadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
}

let activeChild: ChildProcess | undefined
let activeProcessToken: string | undefined
let requestedSignal: NodeJS.Signals | undefined

function signalExitCode(signal: NodeJS.Signals): number {
  const codes: Partial<Record<NodeJS.Signals, number>> = { SIGINT: 130, SIGTERM: 143 }
  return codes[signal] ?? 1
}

function forwardSignal(signal: NodeJS.Signals): void {
  requestedSignal = requestedSignal ?? signal
  if (activeChild?.pid) activeChild.kill(signal)
  if (activeProcessToken) void cleanupOwnedProcesses(activeProcessToken)
}

function installSignalHandlers(): () => void {
  const onInterrupt = (): void => forwardSignal("SIGINT")
  const onTerminate = (): void => forwardSignal("SIGTERM")
  process.on("SIGINT", onInterrupt)
  process.on("SIGTERM", onTerminate)
  return () => {
    process.off("SIGINT", onInterrupt)
    process.off("SIGTERM", onTerminate)
  }
}

async function runProcess(args: readonly string[], env: NodeJS.ProcessEnv): Promise<MobileQaChunkProcessResult> {
  const processToken = `mobile-qa-${randomBytes(24).toString("hex")}`
  const child = spawn("playwright", args, {
    detached: process.platform !== "win32",
    env: { ...env, [PROCESS_TOKEN_ENV]: processToken },
    stdio: ["inherit", "pipe", "pipe"],
  })
  activeChild = child
  activeProcessToken = processToken
  let stdout = ""
  let stderr = ""
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (data: string) => {
    const text = data.toString()
    stdout = appendBoundedProcessOutput(stdout, text)
    process.stdout.write(text)
  })
  child.stderr?.on("data", (data: string) => {
    const text = data.toString()
    stderr = appendBoundedProcessOutput(stderr, text)
    process.stderr.write(text)
  })
  return await new Promise<MobileQaChunkProcessResult>((resolve) => {
    let settled = false
    const finish = (status: number): void => {
      if (settled) return
      settled = true
      if (activeChild === child) activeChild = undefined
      if (activeProcessToken === processToken) activeProcessToken = undefined
      resolve({ status, stdout, stderr })
    }
    child.once("error", () => { void cleanupOwnedProcesses(processToken).finally(() => finish(1)) })
    child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      void cleanupOwnedProcesses(processToken).finally(() => finish(exitCode ?? (signal ? signalExitCode(signal) : 1)))
    })
  })
}

async function runChunk(chunk: MobileQaChunk, list: boolean, root: string): Promise<MobileQaChunkProcessResult> {
  const orchestrationRoot = path.join(root, "orchestration")
  mkdirSync(orchestrationRoot, { recursive: true })
  const env = {
    ...process.env,
    MOBILE_QA_ARTIFACT_ROOT: root,
    MOBILE_QA_INVENTORY: list ? "1" : "0",
    MOBILE_QA_EXPECTED_PROJECTS: chunk.project,
    MOBILE_QA_PRESERVE_ARTIFACTS: "1",
    MOBILE_QA_CHUNK_ID: chunk.id,
    MOBILE_QA_RUN_ID: process.env.MOBILE_QA_RUN_ID,
    MOBILE_QA_CHUNK_SUMMARY: chunkSummaryPath(root, chunk, list),
    MOBILE_QA_CHUNK_REPORT: path.join(orchestrationRoot, `${chunk.id}.${list ? "inventory" : "md"}`),
    MOBILE_QA_HTML_REPORT_DIR: path.join(root, "playwright-report", chunk.id),
    MOBILE_QA_DISCOVERY_PATH: discoveryPath(root, chunk.id),
  }
  return runProcess(buildChunkArgs(chunk, list), env)
}

export function collectChunkResults(
  chunks: readonly MobileQaChunk[],
  list: boolean,
  runner: MobileQaChunkRunner = runChunk,
  root = mobileQaArtifactRoot(),
): Promise<MobileQaChunkResult[]> {
  return collectChunks(chunks, list, runner, root)
}

async function collectChunks(
  chunks: readonly MobileQaChunk[],
  list: boolean,
  runner: MobileQaChunkRunner,
  root: string,
): Promise<MobileQaChunkResult[]> {
  const results: MobileQaChunkResult[] = []
  for (const chunk of chunks) {
    if (requestedSignal) break
    const child = await runner(chunk, list, root)
    const exitCode = child.status ?? 1
    results.push(list ? resultFromDiscovery(root, chunk, exitCode) : readChunkResult(root, chunk, exitCode))
    if (requestedSignal) break
  }
  return results
}

function readDiscovery(filePath: string): MobileQaDiscovery | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"))
    if (typeof parsed !== "object" || parsed === null || !("projects" in parsed) || !Array.isArray(parsed.projects)) return undefined
    return parsed as MobileQaDiscovery
  } catch {
    return undefined
  }
}

function resultFromDiscovery(root: string, chunk: MobileQaChunk, exitCode: number): MobileQaChunkResult {
  const discovery = readDiscovery(discoveryPath(root, chunk.id))
  const project = discovery?.projects.find((candidate) => candidate.name === chunk.project)
  return {
    chunkId: chunk.id,
    exitCode: discovery && exitCode === 0 ? 0 : exitCode || 1,
    projects: [{
      name: project?.name ?? chunk.project,
      status: discovery && exitCode === 0 ? "passed" : "failed",
      tests: project?.tests.length ?? 0,
      failures: discovery && exitCode === 0 ? 0 : 1,
      skipped: 0,
      testIds: project?.tests.map((test) => test.id) ?? [],
    }],
  }
}

export function validateDiscovery(root: string, full: MobileQaDiscovery): void {
  const expectedProjects = new Set(["webkit-standard", "chromium-standard"])
  const fullProjects = new Map(full.projects.map((project) => [project.name, project]))
  if (fullProjects.size !== expectedProjects.size || [...expectedProjects].some((name) => !fullProjects.has(name))) {
    throw new Error("Mobile QA discovery selected an unexpected project set")
  }
  const allKeys = new Set<string>()
  const allFiles = new Set<string>()
  for (const project of full.projects) {
    for (const test of project.tests) {
      const key = `${project.name}:${test.id}`
      if (allKeys.has(key)) throw new Error(`Mobile QA discovery duplicate test ID: ${key}`)
      allKeys.add(key)
      allFiles.add(test.file)
    }
  }
  if (allKeys.size !== FAST_EXPECTED_TESTS || allFiles.size !== FAST_EXPECTED_FILES) {
    throw new Error(`Mobile QA discovery coverage is ${allKeys.size}/${FAST_EXPECTED_TESTS} tests in ${allFiles.size}/${FAST_EXPECTED_FILES} files`)
  }
  const chunkKeys = new Set<string>()
  for (const chunk of MOBILE_QA_CHUNKS) {
    const discovery = readDiscovery(discoveryPath(root, chunk.id))
    if (!discovery) throw new Error(`Mobile QA missing discovery for chunk ${chunk.id}`)
    const project = discovery.projects.find((candidate) => candidate.name === chunk.project)
    const expectedProject = fullProjects.get(chunk.project)
    if (!project || discovery.projects.length !== 1 || !expectedProject) throw new Error(`Mobile QA chunk ${chunk.id} selected an unexpected project set`)
    const expectedFiles = new Set(chunk.files)
    const expectedIds = new Set(expectedProject.tests
      .filter((test) => expectedFiles.has(test.file))
      .filter((test) => chunk.testTitle === undefined || test.title === chunk.testTitle)
      .filter((test) => chunk.excludedTestTitle === undefined || test.title !== chunk.excludedTestTitle)
      .map((test) => test.id))
    const actualIds = new Set(project.tests.map((test) => test.id))
    if (expectedIds.size !== chunk.testCount
      || actualIds.size !== project.tests.length
      || actualIds.size !== expectedIds.size
      || [...actualIds].some((id) => !expectedIds.has(id))
      || project.tests.some((test) => !expectedFiles.has(test.file))) {
      throw new Error(`Mobile QA discovery mismatch for chunk ${chunk.id}`)
    }
    for (const id of actualIds) {
      const key = `${chunk.project}:${id}`
      if (!allKeys.has(key)) throw new Error(`Mobile QA chunk ${chunk.id} discovered an unknown test ID: ${key}`)
      if (chunkKeys.has(key)) throw new Error(`Mobile QA chunk discovery duplicated test ID: ${key}`)
      chunkKeys.add(key)
    }
  }
  if (chunkKeys.size !== allKeys.size || [...allKeys].some((key) => !chunkKeys.has(key))) {
    throw new Error(`Mobile QA chunk discovery union is ${chunkKeys.size}/${allKeys.size} tests`)
  }
}

function validateRuntimeCoverage(root: string, results: readonly MobileQaChunkResult[]): void {
  for (const result of results) {
    const chunk = expectedChunk(result.chunkId)
    const discovery = readDiscovery(discoveryPath(root, chunk.id))
    const project = result.projects[0]
    const discoveredProject = discovery?.projects.find((candidate) => candidate.name === chunk.project)
    const discoveredIds = new Set(discoveredProject?.tests.map((test) => test.id) ?? [])
    const runtimeIds = new Set(project?.testIds ?? [])
    if (!project || runtimeIds.size !== project.testIds.length || runtimeIds.size !== discoveredIds.size || [...discoveredIds].some((id) => !runtimeIds.has(id))) {
      throw new Error(`Mobile QA runtime coverage mismatch for chunk ${chunk.id}`)
    }
  }
}

function writeRunIndex(baseRoot: string, runRoot: string, runId: string): void {
  const relativeRunRoot = path.relative(baseRoot, runRoot)
  atomicWrite(path.join(baseRoot, "MOBILE-QA-REPORT.md"), [
    "# Mobile QA report",
    "",
    `Run: ${runId}`,
    "",
    `Canonical report: ${relativeRunRoot}/MOBILE-QA-REPORT.md`,
    `FAST summary: ${relativeRunRoot}/MOBILE-QA-FAST-SUMMARY.md`,
    "",
  ].join("\n"))
}

export async function runMobileQa(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const list = argv.includes("--list")
  const dryRun = argv.includes("--dry-run")
  if (dryRun) {
    for (const line of formatDryRunPlan(list)) process.stdout.write(`${line}\n`)
    return 0
  }
  requestedSignal = undefined
  const runId = `mobile-qa-${Date.now()}-${process.pid}`
  process.env.MOBILE_QA_RUN_ID = runId
  const baseRoot = mobileQaArtifactRoot()
  const root = process.env.MOBILE_QA_RUN_ROOT ? path.resolve(process.env.MOBILE_QA_RUN_ROOT) : path.join(baseRoot, "runs", runId)
  process.env.MOBILE_QA_ARTIFACT_ROOT = root
  cleanMobileQaArtifacts(root, !list)
  const removeSignalHandlers = installSignalHandlers()
  try {
    const discoveryProcess = await runProcess(buildDiscoveryArgs(), {
      ...process.env,
      MOBILE_QA_ARTIFACT_ROOT: root,
      MOBILE_QA_EXPECTED_PROJECTS: "webkit-standard,chromium-standard",
      MOBILE_QA_PRESERVE_ARTIFACTS: "1",
      MOBILE_QA_INVENTORY: "1",
      MOBILE_QA_RUN_ID: runId,
      MOBILE_QA_CHUNK_ID: "fast",
      MOBILE_QA_CHUNK_REPORT: path.join(root, "orchestration", "fast.inventory"),
      MOBILE_QA_CHUNK_SUMMARY: path.join(root, "orchestration", "fast.inventory.summary.json"),
      MOBILE_QA_DISCOVERY_PATH: discoveryPath(root, "fast"),
    })
    if (discoveryProcess.stdout || discoveryProcess.stderr) process.stdout.write(`${discoveryProcess.stdout}${discoveryProcess.stderr}`)
    const fullDiscovery = readDiscovery(discoveryPath(root, "fast"))
    const results = await collectChunkResults(MOBILE_QA_CHUNKS, list, runChunk, root)
    let exitCode = discoveryProcess.status === 0 ? summarizeChunkResults(results).exitCode : 1
    try {
      if (!fullDiscovery) throw new Error("Mobile QA full FAST discovery was not produced")
      validateDiscovery(root, fullDiscovery)
      validateFastCoverage(results)
      validateRuntimeCoverage(root, results)
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : "Mobile QA coverage validation failed"}\n`)
      exitCode = 1
    }
    const summary: MobileQaFastSummary = { ...summarizeChunkResults(results), exitCode }
    if (list) {
      writeInventory(root, results, summary, runId, fullDiscovery)
      assertInventoryArtifactTree(root)
      process.stdout.write(`Mobile QA FAST inventory: ${summary.totalTests} tests in ${summary.totalFiles} files (NOT RUN)\n`)
    } else {
      writeAggregate(root, results, summary, runId, fullDiscovery)
      writeRunIndex(baseRoot, root, runId)
    }
    return requestedSignal ? signalExitCode(requestedSignal) : summary.exitCode
  } finally {
    removeSignalHandlers()
    activeChild = undefined
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMobileQa().then((exitCode) => { process.exitCode = exitCode }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Mobile QA orchestration failed"}\n`)
    process.exitCode = 1
  })
}
