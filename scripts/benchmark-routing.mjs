#!/usr/bin/env node
/**
 * Phase 1 baseline benchmark for the routing-intelligence rework.
 *
 * Records reproducible per-stage timings (intent parse, direct route,
 * compare, loop, long route) plus provider counts at the public app
 * boundary. It never restarts services, never prints credentials, and
 * does not enforce performance budgets — Phase 7 owns thresholds.
 * Unreachable services are recorded as such, not treated as failures.
 *
 * Usage:
 *   node scripts/benchmark-routing.mjs [--runs 3] [--tag cold] [--base-url http://127.0.0.1:3000]
 *
 * Run through tsx to also capture the local parser timing without the app:
 *   npx tsx scripts/benchmark-routing.mjs
 *
 * Output:
 *   artifacts/routing-rework/raw/     one JSONL sample file per run (gitignored)
 *   artifacts/routing-rework/reports/ sanitized baseline summary (tracked)
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..")
const RAW_DIR = join(repoRoot, "artifacts/routing-rework/raw")
const REPORTS_DIR = join(repoRoot, "artifacts/routing-rework/reports")

const GOLDEN_PROMPT = "2 hour fun ride from Hatboro to Stockton NJ"
const HARRISBURG = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const LANCASTER = { lat: 40.0379, lon: -76.3055, label: "Lancaster" }
const SCRANTON = { lat: 41.4089, lon: -75.6624, label: "Scranton" }

function parseArgs(argv) {
  const args = { runs: 3, baseUrl: process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3000", tag: null }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === "--runs" && value) { args.runs = Math.max(1, Math.min(10, Number(value))); i += 1 }
    else if (flag === "--base-url" && value) { args.baseUrl = value.replace(/\/$/, ""); i += 1 }
    else if (flag === "--tag" && value) { args.tag = value; i += 1 }
  }
  return args
}

async function jsonRequest(baseUrl, path, init = {}, timeoutMs = 60_000) {
  const started = performance.now()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  })
  const payload = await response.json().catch(() => null)
  return {
    status: response.status,
    ok: response.ok,
    elapsedMs: performance.now() - started,
    payload
  }
}

function providerCounts(payload) {
  if (!payload?.routes) return {}
  const counts = {}
  for (const route of payload.routes) {
    const provider = route.provider ?? route.routingSource ?? "unknown"
    counts[provider] = (counts[provider] ?? 0) + 1
  }
  return counts
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function formatMs(value) {
  return value === null ? "n/a" : `${value.toFixed(0)} ms`
}

async function localGoldenParse() {
  // Only available when run under tsx (npm run benchmark:routing).
  try {
    const { parseRidePromptLocally } = await import("../src/lib/ai/ride-intent.ts")
    const samples = []
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now()
      const intent = parseRidePromptLocally(GOLDEN_PROMPT)
      samples.push(performance.now() - started)
      if (i === 0) return { intent, p50: samples[0], samples }
    }
    return { intent: null, p50: null, samples }
  } catch {
    return null
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = args.baseUrl
  const runs = args.runs
  const tag = args.tag ?? "auto"
  const startedAt = new Date().toISOString()
  const raw = []

  console.log(`Switchback baseline benchmark — ${startedAt}`)
  console.log(`base-url: ${baseUrl}  runs: ${runs}  tag: ${tag}`)

  const local = await localGoldenParse()
  if (local) {
    console.log(`local golden parse: ${local.intent?.profile} / ${local.intent?.targetMinutes} min / mode=${local.intent?.mode} (${local.p50.toFixed(1)} ms p0)`)
  } else {
    console.log("local parser not available under plain node; use `npm run benchmark:routing` (tsx) to include it")
  }

  // Health probe: recorded, never fatal.
  let health = null
  try {
    health = await jsonRequest(baseUrl, "/api/health", {}, 15_000)
  } catch (error) {
    health = { status: 0, ok: false, elapsedMs: 0, payload: null, error: String(error) }
  }
  const appUp = Boolean(health?.ok)
  console.log(`health: ${health?.ok ? "ok" : "unreachable"} (${health?.status ?? "n/a"})`)

  const endpoints = [
    { name: "intent.golden", path: "/api/ride-intent", body: { prompt: GOLDEN_PROMPT }, post: true },
    { name: "routes.direct", path: "/api/routes", body: { profile: "twisty", points: [HARRISBURG, LANCASTER] }, post: true },
    { name: "routes.compare", path: "/api/routes", body: { profile: "twisty", compare: true, points: [HARRISBURG, LANCASTER] }, post: true },
    { name: "routes.loop", path: "/api/routes", body: { profile: "adventure", points: [HARRISBURG], roundTrip: { targetMinutes: 120, seed: 17 } }, post: true },
    { name: "routes.long", path: "/api/routes", body: { profile: "scenic", compare: true, points: [HARRISBURG, SCRANTON] }, post: true }
  ]

  const samplesByEndpoint = Object.fromEntries(endpoints.map((endpoint) => [endpoint.name, []]))
  const summaryByEndpoint = {}

  for (let run = 0; run < runs; run += 1) {
    const runTag = tag === "auto" ? (run === 0 ? "cold" : "warm") : tag
    console.log(`\n— run ${run + 1}/${runs} (${runTag}) —`)
    for (const endpoint of endpoints) {
      const result = appUp
        ? await jsonRequest(baseUrl, endpoint.path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(endpoint.body)
          }).catch((error) => ({ status: 0, ok: false, elapsedMs: 0, payload: null, error: String(error) }))
        : { status: 0, ok: false, elapsedMs: 0, payload: null, error: "app unreachable" }
      const record = {
        timestamp: new Date().toISOString(),
        run: run + 1,
        tag: runTag,
        endpoint: endpoint.name,
        path: endpoint.path,
        status: result.status,
        ok: result.ok,
        elapsedMs: Number(result.elapsedMs.toFixed(1)),
        providerCounts: result.ok ? providerCounts(result.payload) : {},
        warnings: result.payload?.warnings ?? null,
        selectedRouteId: result.payload?.selectedRouteId ?? null
      }
      raw.push(record)
      if (result.ok) {
        samplesByEndpoint[endpoint.name].push(result.elapsedMs)
        summaryByEndpoint[endpoint.name] = {
          providerCounts: providerCounts(result.payload)
        }
      }
      console.log(`  ${endpoint.name.padEnd(18)} ${result.ok ? "ok" : "FAIL"} ${formatMs(result.elapsedMs)} (http ${result.status})`)
    }
  }

  // Golden intent assertions (contract, not quality). When the app boundary is
  // unreachable, fall back to the local parser — the no-key configuration is
  // exactly what the boundary runs.
  const goldenIntentRun = raw.find((record) => record.endpoint === "intent.golden" && record.ok)
  const golden = goldenIntentRun?.payload ?? (local?.intent ?? null)
  const goldenSource = goldenIntentRun ? "live /api/ride-intent" : "local parser (app unreachable)"
  const goldenContract = golden
    ? {
        mode: golden.mode,
        profile: golden.profile,
        targetMinutes: golden.targetMinutes,
        destinationQuery: golden.destinationQuery
      }
    : null

  // Persist artifacts.
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(REPORTS_DIR, { recursive: true })
  const rawFile = `baseline-${startedAt.replace(/[:.]/g, "-")}.jsonl`
  await writeFile(join(RAW_DIR, rawFile), raw.map((record) => JSON.stringify(record)).join("\n") + "\n")

  const report = [
    "# Routing Baseline Report",
    "",
    `- Generated: ${startedAt}`,
    `- Base URL: ${baseUrl}`,
    `- Runs: ${runs} (tag: ${tag})`,
    `- Raw samples: \`artifacts/routing-rework/raw/${rawFile}\` (gitignored)`,
    `- App health: ${health?.ok ? "ok" : "unreachable"}`,
    `- Router health: ${health?.payload?.router?.ok === true ? "ok" : "unreachable"}`,
    `- Valhalla health: ${health?.payload?.providers?.valhalla?.ok === true ? "ok" : "unreachable/absent"}`,
    "",
    "## Golden intent contract (2 hour fun ride from Hatboro to Stockton NJ)",
    "",
    `_Source: ${goldenSource}_`,
    "",
    goldenContract
      ? [
          "| Field | Value |",
          "|---|---|",
          `| mode | ${goldenContract.mode} |`,
          `| profile | ${goldenContract.profile} |`,
          `| targetMinutes | ${goldenContract.targetMinutes ?? "null"} |`,
          `| destinationQuery | ${goldenContract.destinationQuery ?? "null"} |`
        ].join("\n")
      : "_App unreachable; golden intent contract not captured this run._",
    "",
    "## Per-endpoint timings",
    "",
    "| Endpoint | runs | p50 | p95 | max | provider counts |",
    "|---|---|---|---|---|---|",
    ...endpoints.map((endpoint) => {
      const samples = [...samplesByEndpoint[endpoint.name]].sort((a, b) => a - b)
      const meta = summaryByEndpoint[endpoint.name] ?? {}
      const counts = Object.entries(meta.providerCounts ?? {})
        .map(([provider, count]) => `${provider}×${count}`)
        .join(", ") || "n/a"
      return [
        `| ${endpoint.name} |`,
        samples.length,
        `| ${formatMs(percentile(samples, 50))} |`,
        `${formatMs(percentile(samples, 95))} |`,
        `${formatMs(samples[samples.length - 1] ?? null)} |`,
        `${counts} |`
      ].join(" ")
    }),
    "",
    "## Notes",
    "",
    "- Thresholds are NOT enforced here; Phase 7 owns the performance budget gates.",
    "- Cold runs reflect an empty in-process cache; warm runs reuse cached provider state.",
    "- A `FAIL` row means the app boundary did not return 2xx for that stage, recorded for reality, not as a regression."
  ].join("\n")

  const reportFile = `baseline-${startedAt.slice(0, 10)}.md`
  await writeFile(join(REPORTS_DIR, reportFile), report + "\n")

  console.log(`\nRaw samples → artifacts/routing-rework/raw/${rawFile}`)
  console.log(`Summary     → artifacts/routing-rework/reports/${reportFile}`)
}

run().catch((error) => {
  console.error("benchmark failed:", error)
  process.exit(1)
})
