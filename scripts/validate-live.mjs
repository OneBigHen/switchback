#!/usr/bin/env node

import { createHash } from "node:crypto"

const baseUrl = (process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "")
const routerUrl = (process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989").replace(/\/$/, "")
const profiles = ["quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"]
const requireValhalla = process.env.REQUIRE_VALHALLA === "1"
const requireElevation = process.env.REQUIRE_ELEVATION === "1"
const graphHopperProfiles = {
  quick: "motorcycle_fastest",
  balanced: "motorcycle_fastest",
  twisty: "motorcycle_twisty",
  scenic: "motorcycle_scenic",
  adventure: "motorcycle_adventure",
  gravel: "motorcycle_adventure",
  "avoid-highways": "motorcycle_fastest",
  neural: "motorcycle_twisty"
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

function sampleGeometry(geometry, limit = 128) {
  if (geometry.length <= limit) return geometry
  return Array.from({ length: limit }, (_, index) =>
    geometry[Math.round(index * (geometry.length - 1) / (limit - 1))]
  )
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
if (requireValhalla && !health?.providers?.valhalla?.ok) {
  throw new Error("Health endpoint did not confirm the required Valhalla provider")
}

const rideIntent = await jsonRequest("/api/ride-intent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "Route me to New Hope, PA avoiding highways" })
})
if (
  rideIntent?.mode !== "destination" ||
  rideIntent?.destinationQuery !== "New Hope, PA" ||
  rideIntent?.avoidHighways !== true
) {
  throw new Error("Free-form ride intent did not preserve destination and highway avoidance")
}

const destinationSearch = await jsonRequest(
  "/api/geocode?q=New%20Hope%2C%20PA&lat=40.2732&lon=-76.8867"
)
const freeformDestination = destinationSearch?.places?.[0]
if (!Number.isFinite(freeformDestination?.lat) || !Number.isFinite(freeformDestination?.lon)) {
  throw new Error("Free-form destination search did not return a routable place")
}

const freeformPrimaryPlan = await jsonRequest("/api/routes", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    profile: rideIntent.profile,
    compare: false,
    avoidHighways: rideIntent.avoidHighways,
    points: [points[0], {
      lat: freeformDestination.lat,
      lon: freeformDestination.lon,
      label: freeformDestination.label
    }]
  })
})
const freeformPrimary = freeformPrimaryPlan?.routes?.[0]
if (!freeformPrimary?.id || !Array.isArray(freeformPrimary.geometry) || freeformPrimary.geometry.length < 2) {
  throw new Error("Free-form destination routing did not return a live primary route")
}

// The production API is progressive: the primary route returns first, then
// the client sends its bounded geometry sample to the alternatives endpoint.
const freeformAlternativesPlan = await jsonRequest("/api/routes", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    profile: rideIntent.profile,
    compare: false,
    candidateSet: "alternatives",
    avoidHighways: rideIntent.avoidHighways,
    points: [points[0], {
      lat: freeformDestination.lat,
      lon: freeformDestination.lon,
      label: freeformDestination.label
    }],
    primaryRoute: {
      id: freeformPrimary.id,
      geometry: sampleGeometry(freeformPrimary.geometry)
    }
  })
})
const freeformRoutes = [freeformPrimary, ...(freeformAlternativesPlan?.routes ?? [])]
const freeformShapes = new Set(freeformRoutes.map((route) =>
  createHash("sha256").update(JSON.stringify(route.geometry)).digest("hex")
))
if (freeformRoutes.length < 3 || freeformShapes.size < 3) {
  throw new Error("Free-form destination routing did not return at least three distinct choices")
}
if (freeformRoutes.some((route) => !["graphhopper", "valhalla"].includes(route.provider))) {
  throw new Error("Free-form route choices did not retain provider provenance")
}
if (requireElevation && freeformRoutes.some((route) => !Number.isFinite(route.ascentMeters))) {
  throw new Error("Free-form route choices did not receive required elevation enrichment")
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

// Rider-visible profiles include deliberate policy aliases: Gravel shares the
// Adventure engine, Neural shares Twisty, and the fastest policies may share a
// legal road choice. Prove the four GraphHopper base models, not eight IDs.
const distinctProfileShapes = new Set(results.map((result) => result.shape)).size
if (distinctProfileShapes < 4) {
  throw new Error(`Motorcycle base profiles produced only ${distinctProfileShapes} distinct route shapes`)
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
console.log(`Free-form destination: ${freeformDestination.label}; ${freeformRoutes.length} routes from ${[...new Set(freeformRoutes.map((route) => route.provider))].join(" + ")}`)
console.log(`Switchback live validation passed at ${baseUrl}`)
