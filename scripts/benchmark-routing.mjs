#!/usr/bin/env node
/**
 * Phase 1 baseline benchmark for the routing-intelligence rework.
 *
 * Records reproducible per-stage timings (intent parse, direct, short and
 * long routes with the alternatives call that follows each, a time-shaped
 * destination, and a loop) plus provider counts at the public app boundary. It never restarts services, never prints credentials, and
 * does not enforce performance budgets — Phase 7 owns thresholds.
 * Unreachable services are recorded as such, not treated as failures.
 *
 * Usage:
 *   node scripts/benchmark-routing.mjs [--runs 3] [--tag cold] [--base-url http://127.0.0.1:3000]
 *   node scripts/benchmark-routing.mjs --calibrate-alternates --graphhopper-url http://127.0.0.1:8988
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
const PHILADELPHIA = { lat: 39.9526, lon: -75.1652, label: "Philadelphia" }
const STATE_COLLEGE = { lat: 40.7934, lon: -77.86, label: "State College" }
const LOCK_HAVEN = { lat: 41.137, lon: -77.4469, label: "Lock Haven" }
/** /api/routes allows 10 requests a minute per client; stay under it. */
const ROUTE_REQUEST_SPACING_MS = 6_500
const ALTERNATE_CALIBRATION_MILES = [35, 60, 80, 100, 155]

/** Nudge a point ~30 m per run so repeated runs measure planning, not the route cache. */
function jitter(point, run) {
  return { ...point, lat: point.lat + run * 0.0003 }
}

/** The client sends the primary line to the alternatives call sampled to 128 points. */
function sampledPrimary(payload) {
  const primary = payload?.routes?.find((route) => route.id === payload.selectedRouteId) ?? payload?.routes?.[0]
  if (!primary?.geometry?.length) return null
  const step = Math.max(1, Math.ceil(primary.geometry.length / 128))
  return { id: primary.id, geometry: primary.geometry.filter((_, index) => index % step === 0) }
}

function parseArgs(argv) {
  const args = {
    runs: 3,
    baseUrl: process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3000",
    tag: null,
    help: false,
    calibrateAlternates: false,
    graphhopperUrl: null
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === "--help" || flag === "-h") args.help = true
    else if (flag === "--calibrate-alternates") args.calibrateAlternates = true
    else if (flag === "--graphhopper-url" && value) { args.graphhopperUrl = value.replace(/\/$/, ""); i += 1 }
    else if (flag === "--runs" && value) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) args.runs = Math.max(1, Math.min(10, parsed))
      i += 1
    }
    else if (flag === "--base-url" && value) { args.baseUrl = value.replace(/\/$/, ""); i += 1 }
    else if (flag === "--tag" && value) { args.tag = value; i += 1 }
  }
  return args
}

function printHelp() {
  console.log([
    "Usage: node scripts/benchmark-routing.mjs [options]",
    "",
    "  --runs N                         samples per endpoint (1-10; default 3)",
    "  --base-url URL                   local/branch OpenGravel app URL",
    "  --tag NAME                       label raw/report samples",
    "  --calibrate-alternates           sweep native alternate-route timings",
    "  --graphhopper-url URL            explicit local GraphHopper URL for calibration",
    "  --help                           show this help"
  ].join("\n"))
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
    payload,
    serverTiming: response.headers.get("server-timing")
  }
}

function routeCount(payload) {
  return Array.isArray(payload?.routes) ? payload.routes.length : null
}

function alternativesOutcome(payload) {
  return payload?.alternativesOutcome ?? null
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

function calibrationPayload(miles) {
  const lat = HARRISBURG.lat
  const longitudeDelta = miles / (69 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))
  return {
    profile: "motorcycle_fastest",
    points: [
      [HARRISBURG.lon, lat],
      [HARRISBURG.lon + longitudeDelta, lat]
    ],
    points_encoded: false,
    instructions: false,
    calc_points: true,
    algorithm: "alternative_route",
    "alternative_route.max_paths": 3,
    "alternative_route.max_weight_factor": 1.8,
    "alternative_route.max_share_factor": 0.62
  }
}

async function runAlternateCalibration(args) {
  if (!args.graphhopperUrl) {
    throw new Error("--calibrate-alternates requires --graphhopper-url pointing at an authorized local GraphHopper instance")
  }
  const samples = []
  const resultsByDistance = {}
  for (const miles of ALTERNATE_CALIBRATION_MILES) {
    const results = []
    resultsByDistance[miles] = results
    for (let run = 0; run < args.runs; run += 1) {
      const result = await jsonRequest(args.graphhopperUrl, "/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calibrationPayload(miles))
      }, 15_000).catch((error) => ({
        status: 0,
        ok: false,
        elapsedMs: 0,
        payload: null,
        serverTiming: null,
        error: String(error)
      }))
      const record = {
        distanceMiles: miles,
        run: run + 1,
        status: result.status,
        ok: result.ok,
        elapsedMs: Number(result.elapsedMs.toFixed(1)),
        pathCount: Array.isArray(result.payload?.paths) ? result.payload.paths.length : null,
        error: result.error ?? null
      }
      results.push(record)
      samples.push(record)
      console.log(`  ${String(miles).padStart(3)} crow miles run ${run + 1}: ${result.ok ? "ok" : "FAIL"} ${formatMs(result.elapsedMs)} (http ${result.status})`)
    }
  }

  const rows = ALTERNATE_CALIBRATION_MILES.map((miles) => {
    const values = resultsByDistance[miles].filter((sample) => sample.ok).map((sample) => sample.elapsedMs).sort((a, b) => a - b)
    return {
      miles,
      runs: resultsByDistance[miles].length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      max: values.at(-1) ?? null,
      pathCount: resultsByDistance[miles].find((sample) => sample.ok)?.pathCount ?? null
    }
  })
  const passing = rows.filter((row) => row.p95 !== null && row.p95 <= 4_000)
  const largestPassingThreshold = passing.at(-1)?.miles ?? null
  const generated = new Date().toISOString()
  const report = [
    "# Native Alternate Calibration",
    "",
    `- Generated: ${generated}`,
    `- GraphHopper URL: ${args.graphhopperUrl}`,
    `- Runs per distance: ${args.runs}`,
    `- Largest threshold with p95 <= 4 seconds: ${largestPassingThreshold === null ? "not measured" : `${largestPassingThreshold} crow miles`}`,
    "",
    "| Crow miles | runs | p50 | p95 | max | paths |",
    "|---:|---:|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${row.miles} | ${row.runs} | ${formatMs(row.p50)} | ${formatMs(row.p95)} | ${formatMs(row.max)} | ${row.pathCount ?? "n/a"} |`),
    "",
    "Threshold calibration is evidence only; this command does not modify runtime configuration or the planner threshold."
  ].join("\n")
  await mkdir(REPORTS_DIR, { recursive: true })
  const reportFile = `alternates-calibration-${generated.slice(0, 10)}.md`
  await writeFile(join(REPORTS_DIR, reportFile), report + "\n")
  console.log(`\nCalibration report → artifacts/routing-rework/reports/${reportFile}`)
  console.log(`Largest measured threshold with p95 <= 4 seconds: ${largestPassingThreshold ?? "not measured"}`)
  return samples
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  if (args.calibrateAlternates) {
    await runAlternateCalibration(args)
    return
  }
  const baseUrl = args.baseUrl
  const runs = args.runs
  const tag = args.tag ?? "auto"
  const startedAt = new Date().toISOString()
  const raw = []

  console.log(`OpenGravel baseline benchmark — ${startedAt}`)
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
    health = { status: 0, ok: false, elapsedMs: 0, payload: null, serverTiming: null, error: String(error) }
  }
  const appUp = Boolean(health?.ok)
  console.log(`health: ${health?.ok ? "ok" : "unreachable"} (${health?.status ?? "n/a"})`)

  // `body` may be a function of the run index and earlier results in the run,
  // so an alternatives stage can send the primary it follows, exactly as the
  // browser does.
  const endpoints = [
    { name: "intent.golden", path: "/api/ride-intent", body: () => ({ prompt: GOLDEN_PROMPT }) },
    { name: "intent.place", path: "/api/ride-intent", body: () => ({ prompt: "Ride to Lock Haven, Pennsylvania, United States" }) },
    { name: "routes.direct", path: "/api/routes", body: (run) => ({ profile: "twisty", points: [jitter(HARRISBURG, run), LANCASTER] }) },
    { name: "routes.direct.alts", path: "/api/routes", after: "routes.direct", body: (run, prior) => ({ profile: "twisty", candidateSet: "alternatives", primaryRoute: sampledPrimary(prior), points: [jitter(HARRISBURG, run), LANCASTER] }) },
    { name: "routes.short", path: "/api/routes", body: (run) => ({ profile: "quick", points: [jitter(STATE_COLLEGE, run), LOCK_HAVEN] }) },
    { name: "routes.mid", path: "/api/routes", body: (run) => ({ profile: "twisty", points: [jitter(HARRISBURG, run), SCRANTON] }) },
    { name: "routes.mid.alts", path: "/api/routes", after: "routes.mid", body: (run, prior) => ({ profile: "twisty", candidateSet: "alternatives", primaryRoute: sampledPrimary(prior), points: [jitter(HARRISBURG, run), SCRANTON] }) },
    { name: "routes.long", path: "/api/routes", body: (run) => ({ profile: "twisty", points: [jitter(PHILADELPHIA, run), STATE_COLLEGE] }) },
    { name: "routes.long.alts", path: "/api/routes", after: "routes.long", body: (run, prior) => ({ profile: "twisty", candidateSet: "alternatives", primaryRoute: sampledPrimary(prior), points: [jitter(PHILADELPHIA, run), STATE_COLLEGE] }) },
    { name: "routes.timed", path: "/api/routes", body: (run) => ({ profile: "twisty", targetMinutes: 150, points: [jitter(HARRISBURG, run), SCRANTON] }) },
    { name: "routes.loop", path: "/api/routes", body: (run) => ({ profile: "adventure", points: [HARRISBURG], roundTrip: { targetMinutes: 120, seed: 17 + run } }) }
  ]

  const samplesByEndpoint = Object.fromEntries(endpoints.map((endpoint) => [endpoint.name, []]))
  const summaryByEndpoint = {}

  for (let run = 0; run < runs; run += 1) {
    const runTag = tag === "auto" ? (run === 0 ? "cold" : "warm") : tag
    console.log(`\n— run ${run + 1}/${runs} (${runTag}) —`)
    const payloads = {}
    for (const endpoint of endpoints) {
      const prior = endpoint.after ? payloads[endpoint.after] : undefined
      const body = endpoint.body(run, prior)
      if (endpoint.path === "/api/routes") await new Promise((resolveDelay) => setTimeout(resolveDelay, ROUTE_REQUEST_SPACING_MS))
      const result = appUp && (!endpoint.after || body.primaryRoute)
        ? await jsonRequest(baseUrl, endpoint.path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          }).catch((error) => ({ status: 0, ok: false, elapsedMs: 0, payload: null, error: String(error) }))
        : { status: 0, ok: false, elapsedMs: 0, payload: null, serverTiming: null, error: appUp ? "no primary to follow" : "app unreachable" }
      payloads[endpoint.name] = result.payload
      const record = {
        timestamp: new Date().toISOString(),
        run: run + 1,
        tag: runTag,
        endpoint: endpoint.name,
        path: endpoint.path,
        status: result.status,
        ok: result.ok,
        elapsedMs: Number(result.elapsedMs.toFixed(1)),
        routeCount: result.ok ? routeCount(result.payload) : null,
        alternativesOutcome: result.ok ? alternativesOutcome(result.payload) : null,
        serverTiming: result.serverTiming ?? null,
        providerCounts: result.ok ? providerCounts(result.payload) : {},
        warnings: result.payload?.warnings ?? null,
        selectedRouteId: result.payload?.selectedRouteId ?? null
      }
      raw.push(record)
      if (result.ok) {
        samplesByEndpoint[endpoint.name].push(result.elapsedMs)
        summaryByEndpoint[endpoint.name] = {
          providerCounts: providerCounts(result.payload),
          routeCount: routeCount(result.payload),
          alternativesOutcome: alternativesOutcome(result.payload),
          serverTiming: result.serverTiming ?? null
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
    "| Endpoint | runs | p50 | p95 | max | route count | outcome | provider counts | Server-Timing |",
    "|---|---:|---:|---:|---:|---:|---|---|---|",
    ...endpoints.map((endpoint) => {
      const samples = [...samplesByEndpoint[endpoint.name]].sort((a, b) => a - b)
      const meta = summaryByEndpoint[endpoint.name] ?? {}
      const counts = Object.entries(meta.providerCounts ?? {})
        .map(([provider, count]) => `${provider}×${count}`)
        .join(", ") || "n/a"
      const outcome = meta.alternativesOutcome?.status ?? "n/a"
      return [
        `| ${endpoint.name} |`,
        samples.length,
        `| ${formatMs(percentile(samples, 50))} |`,
        `${formatMs(percentile(samples, 95))} |`,
        `${formatMs(samples[samples.length - 1] ?? null)} |`,
        `${meta.routeCount ?? "n/a"} |`,
        `${outcome} |`,
        `${counts} |`,
        `${meta.serverTiming ?? "n/a"} |`
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
