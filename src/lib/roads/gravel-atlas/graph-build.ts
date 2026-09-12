import { createHash } from "node:crypto"
import type { CanonicalSegmentDirection } from "@/lib/roads/canonical-segments"

export interface GravelAtlasGraphFingerprintParts {
  osmSha256: string
  graphHopperSha256: string
  configSha256: string
  customModelSha256s: Readonly<Record<string, string>>
}

export type MotorcycleWayTags = Readonly<Record<string, string | undefined>>

const SHA256_HEX = /^[0-9a-f]{64}$/
const ROUTABLE_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "track",
  "road"
])
const HARD_DENIED_ACCESS = new Set(["no", "private"])

function requireSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (!SHA256_HEX.test(normalized)) throw new Error(`${label} must be a SHA-256 hex digest`)
  return normalized
}

/**
 * Content-address the exact inputs that decide the GraphHopper motorcycle
 * topology/weights. Sorting model names keeps the fingerprint stable across
 * filesystem enumeration order.
 */
export function graphFingerprintFromParts(parts: GravelAtlasGraphFingerprintParts): string {
  const models = Object.entries(parts.customModelSha256s)
    .map(([name, digest]) => [name, requireSha256(digest, `Custom model ${name}`)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: 1,
    osmSha256: requireSha256(parts.osmSha256, "OSM input"),
    graphHopperSha256: requireSha256(parts.graphHopperSha256, "GraphHopper binary"),
    configSha256: requireSha256(parts.configSha256, "GraphHopper config"),
    customModels: models
  })).digest("hex")
}

/**
 * The prepared PA+NJ PBF projects motorcycle-specific access/oneway tags onto
 * GraphHopper's motorcar/oneway keys. Keep this exporter conservative: roads
 * that the adventure profile hard-rejects are not eligible for Atlas graph
 * proof even if an official surface source lies nearby.
 */
export function motorcycleWayIsRoutable(tags: MotorcycleWayTags): boolean {
  const highway = tags.highway?.trim().toLowerCase()
  if (!highway || !ROUTABLE_HIGHWAYS.has(highway)) return false

  const generalAccess = tags.access?.trim().toLowerCase()
  if (generalAccess && HARD_DENIED_ACCESS.has(generalAccess)) return false

  for (const value of [tags.motorcar, tags.motor_vehicle, tags.vehicle]) {
    const normalized = value?.trim().toLowerCase()
    if (normalized && HARD_DENIED_ACCESS.has(normalized)) return false
  }
  return true
}

export function motorcycleWayDirections(tags: MotorcycleWayTags): CanonicalSegmentDirection[] {
  const oneway = tags.oneway?.trim().toLowerCase()
  if (oneway === "-1") return ["reverse"]
  if (oneway === "yes" || oneway === "1" || oneway === "true" || tags.junction?.trim().toLowerCase() === "roundabout") {
    return ["forward"]
  }
  return ["forward", "reverse"]
}
