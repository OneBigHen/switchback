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
  const atlasRoutes = Array.isArray(atlas?.routes) ? atlas.routes : []

  if (atlas?.version !== 2) problems.push(`atlas version ${String(atlas?.version)} is not supported version 2`)
  if (atlas?.count !== manifestRoutes.length) {
    problems.push(`atlas count ${String(atlas?.count)} does not match manifest count ${manifestRoutes.length}`)
  }
  if (atlasRoutes.length !== manifestRoutes.length) {
    problems.push(`atlas route array count ${atlasRoutes.length} does not match manifest count ${manifestRoutes.length}`)
  }
  if (atlas?.sourceFingerprint !== expectedFingerprint) {
    problems.push("atlas source fingerprint does not match current GPX library")
  }

  const atlasById = new Map(atlasRoutes.map((route) => [route?.id, route]))
  for (const entry of manifestRoutes) {
    const route = atlasById.get(entry.id)
    if (!route) {
      problems.push(`atlas is missing route ${entry.id}`)
      continue
    }
    if (!validBbox(route.bbox)) problems.push(`atlas route ${entry.id} has an invalid bbox`)
  }

  return problems
}
