import { createHash } from "node:crypto"
import type { EventEmitter } from "node:events"
import { createReadStream } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import type { CanonicalSegmentDirection } from "@/lib/roads/canonical-segments"

export interface GravelAtlasGraphFingerprintParts {
  osmSha256: string
  graphHopperSha256: string
  configSha256: string
  customModelSha256s: Readonly<Record<string, string>>
}

export interface GravelAtlasGraphFingerprintFiles {
  osmPath: string
  graphHopperPath: string
  configPath: string
  customModelsDirectory: string
}

export interface GravelAtlasGraphFingerprintResult extends GravelAtlasGraphFingerprintParts {
  fingerprint: string
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

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", resolve)
    stream.on("error", reject)
  })
  return hash.digest("hex")
}

/**
 * Register child-process completion before any asynchronous stdout consumption.
 * Awaiting the returned promise later is safe even when `close` fired while the
 * caller was still draining output.
 */
export function childProcessCompletion(child: Pick<EventEmitter, "once">): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code: number | null) => resolve(code))
  })
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

export async function graphFingerprintFromFiles(
  files: GravelAtlasGraphFingerprintFiles
): Promise<GravelAtlasGraphFingerprintResult> {
  const modelNames = (await readdir(files.customModelsDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
  if (modelNames.length === 0) throw new Error("No GraphHopper custom models were found")
  const customModelSha256s: Record<string, string> = {}
  for (const name of modelNames) {
    customModelSha256s[name] = await sha256File(path.join(files.customModelsDirectory, name))
  }
  const parts: GravelAtlasGraphFingerprintParts = {
    osmSha256: await sha256File(files.osmPath),
    graphHopperSha256: await sha256File(files.graphHopperPath),
    configSha256: await sha256File(files.configPath),
    customModelSha256s
  }
  return { ...parts, fingerprint: graphFingerprintFromParts(parts) }
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

  // The most specific access tag present decides, mirroring GraphHopper's
  // access parsing (motorcar > motor_vehicle > vehicle > access). The prepared
  // PBF projects motorcycle onto motorcar; honoring motorcycle first keeps the
  // exporter aligned with that projection for raw inputs too.
  for (const value of [tags.motorcycle, tags.motorcar, tags.motor_vehicle, tags.vehicle, tags.access]) {
    const normalized = value?.trim().toLowerCase()
    if (normalized) return !HARD_DENIED_ACCESS.has(normalized)
  }
  return true
}

/**
 * The canonical export must carry the graph fingerprint it was built from; a
 * bare segment array (or a caller-supplied fingerprint for a different graph)
 * would publish reconciliation under the wrong graph identity.
 */
export function parseCanonicalGraphExport(
  value: unknown,
  requestedFingerprint?: string
): { graphFingerprint: string; segments: unknown[] } {
  const payload = value && typeof value === "object" && !Array.isArray(value)
    ? value as { graphFingerprint?: unknown; segments?: unknown }
    : null
  const embedded = typeof payload?.graphFingerprint === "string" ? payload.graphFingerprint.trim() : ""
  if (!payload || !Array.isArray(payload.segments) || !embedded) {
    throw new Error("Canonical graph export must be an object with segments and its embedded graphFingerprint")
  }
  const requested = requestedFingerprint?.trim()
  if (requested && requested !== embedded) {
    throw new Error("Requested graph fingerprint does not match the canonical graph export")
  }
  return { graphFingerprint: embedded, segments: payload.segments }
}

/**
 * The single-pass exporter resolves way node references from nodes already
 * seen. OSM files are not guaranteed node-first, so refuse input where a node
 * follows a way instead of silently dropping segments.
 */
export function createNodeFirstOplGuard(): { observe(line: string): void } {
  let sawWay = false
  return {
    observe(line) {
      if (line.startsWith("w")) sawWay = true
      else if (line.startsWith("n") && sawWay) {
        throw new Error("OSM input is not sorted node-first; run `osmium sort` before exporting canonical segments")
      }
    }
  }
}

export function motorcycleWayDirections(tags: MotorcycleWayTags): CanonicalSegmentDirection[] {
  const oneway = tags.oneway?.trim().toLowerCase()
  if (oneway === "-1") return ["reverse"]
  if (oneway === "yes" || oneway === "1" || oneway === "true" || tags.junction?.trim().toLowerCase() === "roundabout") {
    return ["forward"]
  }
  return ["forward", "reverse"]
}
