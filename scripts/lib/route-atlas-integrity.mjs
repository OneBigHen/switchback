import { createHash } from "node:crypto"

export function atlasSourceFingerprint(manifestRaw, manifestRoutes, routeSources) {
  const hash = createHash("sha256")
  hash.update("switchback-route-atlas-v1\0")
  hash.update(manifestRaw)
  for (const entry of manifestRoutes) {
    hash.update("\0route\0")
    hash.update(String(entry.id))
    hash.update("\0")
    const raw = routeSources.get(entry.id)
    if (typeof raw !== "string") throw new Error(`Missing route source for ${entry.id}`)
    hash.update(raw)
  }
  return hash.digest("hex")
}

function validBbox(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((part) => !Number.isFinite(part))) return false
  const [west, south, east, north] = value
  return west <= east && south <= north && west >= -180 && east <= 180 && south >= -90 && north <= 90
}

export function atlasIntegrityProblems({ manifest, atlas, expectedFingerprint }) {
  const problems = []
  const manifestRoutes = Array.isArray(manifest?.routes) ? manifest.routes : []
  const atlasRoutes = atlas?.routes && !Array.isArray(atlas.routes) && typeof atlas.routes === "object"
    ? atlas.routes
    : {}
  const atlasEntries = Object.entries(atlasRoutes)
  const canonicalCount = atlasEntries.filter(([, route]) => !route?.duplicateOf).length

  if (atlas?.version !== 2) problems.push(`atlas version ${String(atlas?.version)} is not supported version 2`)
  if (atlas?.count !== canonicalCount) {
    problems.push(`atlas canonical count ${String(atlas?.count)} does not match route data count ${canonicalCount}`)
  }
  if (atlasEntries.length !== manifestRoutes.length) {
    problems.push(`atlas route count ${atlasEntries.length} does not match manifest count ${manifestRoutes.length}`)
  }
  if (atlas?.sourceFingerprint !== expectedFingerprint) {
    problems.push("atlas source fingerprint does not match current GPX library")
  }

  const manifestIds = new Set(manifestRoutes.map((entry) => entry.id))
  for (const entry of manifestRoutes) {
    const route = atlasRoutes[entry.id]
    if (!route) {
      problems.push(`atlas is missing route ${entry.id}`)
      continue
    }
    if (!validBbox(route.bbox)) problems.push(`atlas route ${entry.id} has an invalid bbox`)
    if (route.duplicateOf && !manifestIds.has(route.duplicateOf)) {
      problems.push(`atlas route ${entry.id} references missing duplicate ${route.duplicateOf}`)
    }
  }

  for (const routeId of Object.keys(atlasRoutes)) {
    if (!manifestIds.has(routeId)) problems.push(`atlas contains route ${routeId} not present in manifest`)
  }

  return problems
}
