#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..")
const qualityDirectory = resolve(root, "artifacts/quality")
const docsDirectory = resolve(root, "docs/quality")
mkdirSync(qualityDirectory, { recursive: true })
mkdirSync(docsDirectory, { recursive: true })

const appBase = process.env.SWITCHBACK_LIVE_BASE_URL?.trim().replace(/\/$/, "") || ""
const graphHopperBase = process.env.GRAPHHOPPER_URL?.trim().replace(/\/$/, "") || ""
const valhallaBase = process.env.VALHALLA_URL?.trim().replace(/\/$/, "") || ""
const elevationBase = process.env.VALHALLA_ELEVATION_URL?.trim().replace(/\/$/, "") || ""
const photonBase = process.env.PHOTON_URL?.trim() || ""
const checks = []

const publicPoints = [
  { lat: 40.2732, lon: -76.8867 },
  { lat: 40.0379, lon: -76.3055 }
]

async function fetchJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", ...(init.headers ?? {}) }
    })
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* status is still useful */ }
    return { ok: response.ok, status: response.status, body }
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.name : "request failed" }
  }
}

function addCheck(name, configured, result, optional = false) {
  if (!configured) {
    checks.push({ name, status: "NOT CONFIGURED", detail: "No endpoint configured" })
    return
  }
  if (result.ok) {
    checks.push({ name, status: "PASS", detail: `HTTP ${result.status}` })
    return
  }
  checks.push({
    name,
    status: optional ? "DEGRADED" : "FAIL",
    detail: result.status ? `HTTP ${result.status}` : "Timed out or unreachable"
  })
}

async function runChecks() {
  if (appBase) {
    const health = await fetchJson(`${appBase}/api/health`)
    addCheck("Switchback app health", true, { ...health, ok: health.ok && health.body?.ok === true })
    const geocode = await fetchJson(`${appBase}/api/geocode?q=Harrisburg&limit=1`)
    addCheck("App geocode", true, { ...geocode, ok: geocode.ok && Array.isArray(geocode.body?.places) })
    const route = await fetchJson(`${appBase}/api/routes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "quick", compare: false, points: publicPoints })
    })
    addCheck("App route outcome", true, {
      ...route,
      ok: route.ok && Array.isArray(route.body?.routes)
        && route.body.routes[0]?.geometry?.length >= 2
        && route.body.routes[0]?.distanceMiles > 0
        && route.body.routes[0]?.durationMinutes > 0
    })
  } else {
    addCheck("Switchback app health", false, {})
    addCheck("App geocode", false, {})
    addCheck("App route outcome", false, {})
  }

  if (graphHopperBase) {
    addCheck("GraphHopper health", true, await fetchJson(`${graphHopperBase}/health`))
    addCheck("GraphHopper route", true, await fetchJson(`${graphHopperBase}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "motorcycle_fastest",
        points: publicPoints.map((point) => [point.lon, point.lat]),
        points_encoded: false,
        details: ["road_class", "surface", "toll"]
      })
    }))
  } else {
    addCheck("GraphHopper health", false, {})
    addCheck("GraphHopper route", false, {})
  }

  if (valhallaBase) {
    addCheck("Valhalla status", true, await fetchJson(`${valhallaBase}/status`), true)
  } else {
    addCheck("Valhalla status", false, {}, true)
  }
  if (elevationBase) {
    addCheck("Valhalla elevation", true, await fetchJson(`${elevationBase.replace(/\/$/, "")}/height`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: publicPoints })
    }), true)
  } else {
    addCheck("Valhalla elevation", false, {}, true)
  }
  if (photonBase) {
    const url = new URL(photonBase)
    url.searchParams.set("q", "Harrisburg")
    url.searchParams.set("limit", "1")
    addCheck("Photon geocode", true, await fetchJson(url), true)
  } else {
    addCheck("Photon geocode", false, {}, true)
  }
}

await runChecks()
const report = {
  generatedAt: new Date().toISOString(),
  checks,
  configured: {
    app: Boolean(appBase),
    graphHopper: Boolean(graphHopperBase),
    valhalla: Boolean(valhallaBase),
    elevation: Boolean(elevationBase),
    photon: Boolean(photonBase)
  }
}
writeFileSync(resolve(qualityDirectory, "live-provider-results.json"), `${JSON.stringify(report, null, 2)}\n`)

const markdown = [
  "# Live provider results",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "This report contains only bounded public-coordinate smoke checks. Credentials and endpoint URLs are intentionally omitted.",
  "",
  "| Capability | Status | Detail |",
  "|---|---|---|",
  ...checks.map((check) => `| ${check.name} | ${check.status} | ${check.detail} |`),
  "",
  "NOT CONFIGURED means the capability was not attempted. DEGRADED is an optional configured provider that did not answer; the primary route remains authoritative.",
  ""
].join("\n")
writeFileSync(resolve(docsDirectory, "LIVE_PROVIDER_RESULTS.md"), markdown)
console.log(checks.map((check) => `${check.status.padEnd(14)} ${check.name}`).join("\n"))

const primaryFailures = checks.filter((check) => check.status === "FAIL")
if (primaryFailures.length > 0) process.exitCode = 1
