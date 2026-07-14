#!/usr/bin/env node

import { createHash } from "node:crypto"

const baseUrl = (process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "")
const routerUrl = (process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989").replace(/\/$/, "")
const profiles = ["quick", "twisty", "scenic", "adventure"]
const graphHopperProfiles = {
  quick: "motorcycle_fastest",
  twisty: "motorcycle_twisty",
  scenic: "motorcycle_scenic",
  adventure: "motorcycle_adventure"
}
const points = [
  { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
  { lat: 40.0379, lon: -76.3055, label: "Lancaster" }
]

async function jsonRequest(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(45_000)
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? `${response.status} ${response.statusText}`
    throw new Error(`${path}: ${message}`)
  }
  return payload
}

async function graphHopperRequest(body) {
  const response = await fetch(`${routerUrl}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000)
  })
  const payload = await response.json().catch(() => null)
  return { payload, response }
}

const health = await jsonRequest("/api/health")
if (!health?.app?.ok || !health?.router?.ok) {
  throw new Error("Health endpoint did not confirm both app and router")
}

const curvature = await jsonRequest("/api/curvature?south=39.7&west=-77.5&north=40.8&east=-75.8&minScore=650&limit=5")
if (curvature?.type !== "FeatureCollection" || curvature.features?.length === 0) {
  throw new Error("Curvature endpoint did not return mapped road segments")
}

const gpxCatalog = await jsonRequest("/api/gpx-library")
if (gpxCatalog?.importedRoutes < 400 || gpxCatalog.routes?.length !== gpxCatalog.importedRoutes) {
  throw new Error("Project GPX catalog did not return the imported route collection")
}
const catalogRoute = await jsonRequest(`/api/gpx-library?id=${encodeURIComponent(gpxCatalog.routes[0].id)}`)
if (catalogRoute?.geometry?.length < 2 || catalogRoute.id !== gpxCatalog.routes[0].id) {
  throw new Error("Project GPX catalog could not load route geometry")
}

const results = []
for (const profile of profiles) {
  const plan = await jsonRequest("/api/routes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, compare: false, points })
  })
  const route = plan?.routes?.[0]
  if (!route || route.routingSource !== "live" || route.geometry?.length < 2) {
    throw new Error(`${profile}: expected live road geometry`)
  }
  results.push({
    profile,
    miles: route.distanceMiles,
    minutes: route.durationMinutes,
    points: route.geometry.length,
    instructions: route.instructions.length,
    shape: createHash("sha256").update(JSON.stringify(route.geometry)).digest("hex").slice(0, 10)
  })
}

if (new Set(results.map((result) => result.shape)).size !== profiles.length) {
  throw new Error("Motorcycle profiles did not produce four distinct route shapes")
}

// OSM way 969576184 is an 82.33 m service road explicitly tagged
// motorcycle=no. This is a stable regression for the derived access extract:
// before normalization, every profile illegally routed the exact way.
const restrictedWayPoints = [
  [-78.4160101, 40.4778539],
  [-78.4151798, 40.4782149]
]
const restrictedChecks = []
for (const profile of profiles) {
  const { payload, response } = await graphHopperRequest({
    profile: graphHopperProfiles[profile],
    points: restrictedWayPoints,
    points_encoded: false,
    instructions: false
  })

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(`${profile}: router failed while checking motorcycle access`)
    }
    restrictedChecks.push({ profile, result: "not routable" })
    continue
  }

  const distanceMeters = payload?.paths?.[0]?.distance
  if (!Number.isFinite(distanceMeters)) {
    throw new Error(`${profile}: missing distance for motorcycle access check`)
  }
  if (distanceMeters >= 60 && distanceMeters <= 110) {
    throw new Error(`${profile}: illegally routed OSM way 969576184 tagged motorcycle=no`)
  }
  restrictedChecks.push({ profile, result: `${distanceMeters.toFixed(1)} m detour` })
}

console.table(results)
console.table(restrictedChecks)
console.log(`Switchback live validation passed at ${baseUrl}`)
