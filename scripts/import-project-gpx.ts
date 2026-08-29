import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { analyzeGeometry, haversine } from "../src/lib/routing/scoring"
import { areGpxFingerprintsNear, splitGpxDocument, type GpxGeometryFingerprint, type NormalizedGpxRoute } from "../src/lib/gpx/corpus-ingest"
import { mapMatchGpxStream, type GpxMapMatchResult } from "../src/lib/gpx/map-matching"
import { analyzeGpxIntelligence, type GpxIntelligenceReport } from "../src/lib/gpx/intelligence"
import { GpxStreamParser, type GpxStreamDocument } from "../src/lib/gpx/streaming-parser"
import type { PlannedRoute, Waypoint } from "../src/lib/routing/types"

const OWNER_CORPUS_MAX_POINTS = 250_000
const OWNER_CORPUS_MAX_SEGMENTS = 2_048
const sourceRoot = path.resolve(process.argv[2] ?? "/root/Vibe")
const outputRoot = path.resolve(process.argv[3] ?? "data/gpx-library")
const stageRoot = `${outputRoot}.pending-${process.pid}-${Date.now()}`
const routesDirectory = path.join(stageRoot, "routes")
const rejectedDirectory = path.join(stageRoot, "rejected")
const originalsDirectory = path.join(stageRoot, "originals")
const matchEndpoint = process.env.GRAPHHOPPER_MATCH_URL?.trim() || undefined
const matchProfile = process.env.GRAPHHOPPER_MATCH_PROFILE?.trim() || "motorcycle_adventure"

interface SourceFileGroup {
  hash: string
  paths: string[]
  document: GpxStreamDocument | null
  parseError: string | null
}

interface CatalogRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  sourceFile: string
  sources: string[]
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  mapMatchStatus?: GpxMapMatchResult["status"]
  matchPercent?: number | null
  unmatchedPercent?: number | null
  unmatchedSpanCount?: number
  dataConfidenceLevel?: GpxIntelligenceReport["dataConfidence"]["level"]
}

interface ImportedRouteArtifact extends PlannedRoute {
  segmentStarts: number[]
  sourceContentSha256: string
  sourceFiles: string[]
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  mapMatch: GpxMapMatchResult
  gpxIntelligence: GpxIntelligenceReport
  ingest: {
    sourceFormat: "gpx"
    segmentCount: number
    invalidPointCount: number
    dedupedPointCount: number
    gapCount: number
    hasGaps: boolean
  }
}

interface RouteEntry {
  summary: CatalogRoute
  artifact: ImportedRouteArtifact
  fingerprint: GpxGeometryFingerprint
}

interface RejectedFile {
  id: string
  sourceFile: string
  sources: string[]
  reason: string
}

function sourceProject(filePath: string): string {
  return path.relative(sourceRoot, filePath).split(path.sep)[0] || "Unknown project"
}

function relativeSource(filePath: string): string {
  return path.relative(sourceRoot, filePath)
}

function safeFileName(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]+/g, "_") || "source.gpx"
}

function readGpxSource(filePath: string): AsyncIterable<Uint8Array> {
  return createReadStream(filePath)
}

async function hashAndParse(filePath: string): Promise<{
  hash: string
  document: GpxStreamDocument | null
  parseError: string | null
}> {
  const hash = createHash("sha256")
  const parser = new GpxStreamParser({
    maxPoints: OWNER_CORPUS_MAX_POINTS,
    maxSegments: OWNER_CORPUS_MAX_SEGMENTS
  })
  let parseError: string | null = null
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
    if (parseError) continue
    try {
      parser.push(chunk)
    } catch (caught) {
      parseError = caught instanceof Error ? caught.message : "GPX parsing failed"
    }
  }
  if (!parseError) {
    try {
      const document = parser.finish()
      return { hash: hash.digest("hex"), document, parseError: null }
    } catch (caught) {
      parseError = caught instanceof Error ? caught.message : "GPX parsing failed"
    }
  }
  return { hash: hash.digest("hex"), document: null, parseError }
}

async function copySources(paths: string[], directory: string): Promise<string[]> {
  await mkdir(directory, { recursive: true })
  const copied: string[] = []
  for (const [index, filePath] of paths.entries()) {
    const target = path.join(directory, `${String(index + 1).padStart(3, "0")}-${safeFileName(filePath)}`)
    await copyFile(filePath, target)
    copied.push(path.relative(stageRoot, target))
  }
  return copied
}

function primaryPath(paths: string[]): string {
  return paths.toSorted((first, second) => first.length - second.length || first.localeCompare(second))[0]!
}

function routeWaypoints(normalized: NormalizedGpxRoute): Waypoint[] {
  const explicit = normalized.waypoints.map((waypoint) => ({ ...waypoint }))
  const start = normalized.geometry[0]!
  const finish = normalized.geometry.at(-1)!
  const startIndex = explicit.findIndex((waypoint) => haversine([waypoint.lon, waypoint.lat], start) <= 25)
  const finishIndex = explicit.findIndex((waypoint, index) =>
    index !== startIndex && haversine([waypoint.lon, waypoint.lat], finish) <= 25
  )
  const startWaypoint = startIndex >= 0 ? explicit[startIndex]! : { lat: start[1], lon: start[0], label: "Track start" }
  const finishWaypoint = finishIndex >= 0 ? explicit[finishIndex]! : { lat: finish[1], lon: finish[0], label: "Track finish" }
  return [
    startWaypoint,
    ...explicit.filter((_, index) => index !== startIndex && index !== finishIndex),
    finishWaypoint
  ]
}

async function buildRouteArtifacts(
  group: SourceFileGroup,
  id: string,
  primary: string,
  sources: string[]
): Promise<{ artifact: ImportedRouteArtifact; normalized: NormalizedGpxRoute }[]> {
  if (!group.document) throw new Error(group.parseError ?? "GPX parsing failed")
  // Route-sharing exports often pack a rider's whole collection into one file.
  // Flattened, those became a single implausible route made mostly of
  // straight-line jumps between towns; split, each ride keeps its own geometry.
  const rides = splitGpxDocument(group.document, { id, fileName: path.basename(primary) })
  // Map matching consumes the source file as a whole, so a per-ride result is
  // not available for a split file. Claiming the file-level match for each ride
  // would attribute another ride's matched distance, so it is reported as such.
  const mapMatch = rides.length > 1
    ? { status: "unmatched" as const, provider: null, profile: null, message: "Source file contained several rides; matched per file, not per ride." }
    : await mapMatchGpxStream(readGpxSource(primary), { endpoint: matchEndpoint, profile: matchProfile })
  return rides.map((normalized) => buildOneArtifact(normalized, group, primary, sources, mapMatch))
}

function buildOneArtifact(
  normalized: NormalizedGpxRoute,
  group: SourceFileGroup,
  primary: string,
  sources: string[],
  mapMatch: GpxMapMatchResult
): { artifact: ImportedRouteArtifact; normalized: NormalizedGpxRoute } {
  const id = normalized.id
  const analysis = analyzeGeometry(normalized.geometry)
  const gpxIntelligence = analyzeGpxIntelligence(normalized, mapMatch)
  const artifact: ImportedRouteArtifact = {
    id,
    name: normalized.name,
    profile: "scenic",
    geometry: normalized.geometry,
    waypoints: routeWaypoints(normalized),
    instructions: [],
    distanceMiles: Number((normalized.distanceMeters / 1609.344).toFixed(2)),
    durationMinutes: normalized.durationMinutes,
    ascentMeters: normalized.ascentMeters,
    descentMeters: normalized.descentMeters,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    navigationMode: "track-only",
    previewOnly: false,
    segmentStarts: normalized.segmentStarts,
    sourceContentSha256: group.hash,
    sourceFiles: sources,
    mapMatch,
    gpxIntelligence,
    ingest: {
      sourceFormat: "gpx",
      segmentCount: normalized.segments.length,
      invalidPointCount: normalized.invalidPointCount,
      dedupedPointCount: normalized.dedupedPointCount,
      gapCount: normalized.gapCount,
      hasGaps: normalized.hasGaps
    }
  }
  return { artifact, normalized }
}

function discoverGpxFiles(): string[] {
  try {
    return execFileSync("rg", ["--files", sourceRoot, "-g", "*.gpx", "-g", "*.GPX"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    }).split("\n").filter(Boolean)
  } catch (caught) {
    if (caught && typeof caught === "object" && "status" in caught && caught.status === 1) return []
    throw caught
  }
}

function unionFind(size: number): { find: (value: number) => number; union: (left: number, right: number) => void } {
  const parents = Array.from({ length: size }, (_, index) => index)
  const find = (value: number): number => {
    if (parents[value] !== value) parents[value] = find(parents[value]!)
    return parents[value]!
  }
  const union = (left: number, right: number): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  return { find, union }
}

function familyId(entries: RouteEntry[]): string {
  return createHash("sha256").update(entries.map((entry) => entry.summary.id).toSorted().join("|")).digest("hex").slice(0, 24)
}

function canonicalEntry(entries: RouteEntry[]): RouteEntry {
  return entries.toSorted((left, right) => {
    const leftGenerated = /^(?:rideplanner|planning-skill)$/i.test(left.summary.sourceProject) ? 1 : 0
    const rightGenerated = /^(?:rideplanner|planning-skill)$/i.test(right.summary.sourceProject) ? 1 : 0
    return leftGenerated - rightGenerated || left.summary.sourceFile.length - right.summary.sourceFile.length || left.summary.sourceFile.localeCompare(right.summary.sourceFile)
  })[0]!
}

function assignDuplicateFamilies(entries: RouteEntry[]): { duplicateFamilies: number; nearDuplicateFamilies: number; nearDuplicateRoutes: number } {
  if (entries.length === 0) return { duplicateFamilies: 0, nearDuplicateFamilies: 0, nearDuplicateRoutes: 0 }
  const unions = unionFind(entries.length)
  // ponytail: pairwise scan is bounded to the owner corpus; add a spatial index when corpus size/SLO requires it.
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      if (areGpxFingerprintsNear(entries[left]!.fingerprint, entries[right]!.fingerprint)) {
        unions.union(left, right)
      }
    }
  }
  const components = new Map<number, RouteEntry[]>()
  entries.forEach((entry, index) => {
    const root = unions.find(index)
    const component = components.get(root)
    if (component) component.push(entry)
    else components.set(root, [entry])
  })
  let duplicateFamilies = 0
  let nearDuplicateFamilies = 0
  let nearDuplicateRoutes = 0
  for (const component of components.values()) {
    const exactDuplicateFiles = component.some((entry) => entry.summary.sources.length > 1)
    if (component.length < 2 && !exactDuplicateFiles) continue
    duplicateFamilies += 1
    if (component.length > 1) {
      nearDuplicateFamilies += 1
      nearDuplicateRoutes += component.length
    }
    const id = familyId(component)
    const canonical = canonicalEntry(component)
    for (const entry of component) {
      const role = entry === canonical ? "canonical" : "near-duplicate"
      entry.summary.duplicateFamilyId = id
      entry.summary.duplicateFamilySize = component.length
      entry.summary.duplicateFamilyRole = role
      entry.summary.mapMatchStatus = entry.artifact.mapMatch.status
      entry.artifact.duplicateFamilyId = id
      entry.artifact.duplicateFamilySize = component.length
      entry.artifact.duplicateFamilyRole = role
    }
  }
  return { duplicateFamilies, nearDuplicateFamilies, nearDuplicateRoutes }
}

const discovered = discoverGpxFiles()
  .map((filePath) => path.resolve(filePath))
  .filter((filePath) => filePath !== outputRoot &&
    !filePath.startsWith(`${outputRoot}${path.sep}`) &&
    !filePath.startsWith(`${outputRoot}.`))
  .toSorted()
const byHash = new Map<string, SourceFileGroup>()

for (const filePath of discovered) {
  const parsed = await hashAndParse(filePath)
  const existing = byHash.get(parsed.hash)
  if (existing) existing.paths.push(filePath)
  else byHash.set(parsed.hash, { hash: parsed.hash, paths: [filePath], document: parsed.document, parseError: parsed.parseError })
}

await rm(stageRoot, { recursive: true, force: true })
await mkdir(routesDirectory, { recursive: true })
await mkdir(rejectedDirectory, { recursive: true })
await mkdir(originalsDirectory, { recursive: true })

const entries: RouteEntry[] = []
const rejected: RejectedFile[] = []
for (const group of byHash.values()) {
  const id = `project-gpx-${group.hash.slice(0, 24)}`
  const primary = primaryPath(group.paths)
  const sources = group.paths.map(relativeSource).toSorted()
  try {
    const built = await buildRouteArtifacts(group, id, primary, sources)
    // Sources are copied once per file, under the file's own id, however many
    // rides came out of it.
    await copySources(group.paths, path.join(originalsDirectory, id))
    for (const { artifact, normalized } of built) entries.push({
      artifact,
      fingerprint: normalized.fingerprint,
      summary: {
        id: artifact.id,
        name: artifact.name,
        distanceMiles: artifact.distanceMiles,
        durationMinutes: artifact.durationMinutes,
        twistiness: artifact.twistiness,
        turnCount: artifact.turnCount,
        sourceProject: sourceProject(primary),
        sourceFile: relativeSource(primary),
        sources,
        mapMatchStatus: artifact.mapMatch.status,
        matchPercent: artifact.gpxIntelligence.match.matchPercent,
        unmatchedPercent: artifact.gpxIntelligence.match.unmatchedPercent,
        unmatchedSpanCount: artifact.gpxIntelligence.unmatchedSpans.length,
        dataConfidenceLevel: artifact.gpxIntelligence.dataConfidence.level
      }
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : group.parseError ?? "Unknown GPX parsing error"
    await copySources(group.paths, path.join(rejectedDirectory, id))
    rejected.push({ id, sourceFile: relativeSource(primary), sources, reason })
  }
}

const familyStats = assignDuplicateFamilies(entries)
const routes = entries.map((entry) => entry.summary).toSorted((first, second) =>
  first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
)
for (const entry of entries) {
  await writeFile(path.join(routesDirectory, `${entry.artifact.id}.json`), JSON.stringify(entry.artifact))
}
rejected.sort((first, second) => first.sourceFile.localeCompare(second.sourceFile))
const manifest = {
  version: 3,
  generatedAt: new Date().toISOString(),
  sourceRoot,
  scannedFiles: discovered.length,
  duplicateFiles: discovered.length - byHash.size,
  uniqueFiles: byHash.size,
  importedRoutes: routes.length,
  rejectedFiles: rejected.length,
  duplicateFamilies: familyStats.duplicateFamilies,
  nearDuplicateFamilies: familyStats.nearDuplicateFamilies,
  nearDuplicateRoutes: familyStats.nearDuplicateRoutes,
  mapMatch: {
    provider: matchEndpoint ? "graphhopper" : null,
    endpointConfigured: Boolean(matchEndpoint),
    profile: matchEndpoint ? matchProfile : null
  },
  routes,
  rejected
}
await writeFile(path.join(stageRoot, "manifest.json"), JSON.stringify(manifest, null, 2))

let previousOutput: string | null = null
try {
  previousOutput = `${outputRoot}.previous-${Date.now()}`
  await rename(outputRoot, previousOutput)
} catch (caught) {
  if (!(caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT")) throw caught
  previousOutput = null
}
try {
  await rename(stageRoot, outputRoot)
} catch (caught) {
  if (previousOutput) await rename(previousOutput, outputRoot).catch(() => undefined)
  throw caught
}

console.log(`Scanned ${manifest.scannedFiles} GPX files (${manifest.uniqueFiles} unique).`)
console.log(`Imported ${manifest.importedRoutes} routes; preserved ${manifest.rejectedFiles} rejected files for review.`)
console.log(`Duplicate families: ${manifest.duplicateFamilies} (${manifest.nearDuplicateFamilies} near-duplicate families).`)
console.log(`Map matching: ${manifest.mapMatch.endpointConfigured ? "configured; inspect per-route status" : "not configured; routes remain track-only"}.`)
if (previousOutput) console.log(`Previous generated catalog preserved at ${previousOutput}.`)
for (const item of rejected.slice(0, 20)) console.log(`- ${item.sourceFile}: ${item.reason}`)
if (rejected.length > 20) console.log(`- ...and ${rejected.length - 20} more in manifest.json`)
