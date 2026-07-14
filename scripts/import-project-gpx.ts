import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { analyzeGeometry } from "../src/lib/routing/scoring"
import type { Coordinate, PlannedRoute } from "../src/lib/routing/types"

const sourceRoot = path.resolve(process.argv[2] ?? "/root/Vibe")
const outputRoot = path.resolve(process.argv[3] ?? "data/gpx-library")
const routesDirectory = path.join(outputRoot, "routes")
const rejectedDirectory = path.join(outputRoot, "rejected")

const EARTH_RADIUS_METERS = 6_371_000

function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLat = radians(first[1])
  const secondLat = radians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function geometryDistance(geometry: Coordinate[]): number {
  return geometry.slice(1).reduce(
    (total, coordinate, index) => total + distanceMeters(geometry[index], coordinate),
    0
  )
}

function coordinatesFromXml(xml: string, tag: "trkpt" | "rtept" | "wpt"): Coordinate[] {
  const coordinates: Coordinate[] = []
  const pointPattern = new RegExp(`<(?:[\\w-]+:)?${tag}\\b([^>]*)>`, "gi")
  for (const match of xml.matchAll(pointPattern)) {
    const attributes = match[1]
    const latitudeText = attributes.match(/\blat\s*=\s*["']([^"']+)["']/i)?.[1]
    const longitudeText = attributes.match(/\blon\s*=\s*["']([^"']+)["']/i)?.[1]
    const latitude = Number(latitudeText)
    const longitude = Number(longitudeText)
    if (Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      coordinates.push([longitude, latitude])
    }
  }
  return coordinates
}

function longestSegment(xml: string, container: "trkseg" | "rte", point: "trkpt" | "rtept"): Coordinate[] {
  const containerPattern = new RegExp(
    `<(?:[\\w-]+:)?${container}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${container}\\s*>`,
    "gi"
  )
  const segments = [...xml.matchAll(containerPattern)]
    .map((match) => coordinatesFromXml(match[1], point))
    .filter((coordinates) => coordinates.length >= 2)
  if (segments.length === 0) return coordinatesFromXml(xml, point)
  return segments.reduce((longest, segment) =>
    geometryDistance(segment) > geometryDistance(longest) ? segment : longest
  )
}

function decodedName(xml: string, container: "metadata" | "trk" | "rte"): string | undefined {
  const match = xml.match(new RegExp(
    `<(?:[\\w-]+:)?${container}\\b[^>]*>[\\s\\S]*?<(?:[\\w-]+:)?name\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?name\\s*>`,
    "i"
  ))
  return match?.[1]
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .trim()
}

function parseCatalogRoute(xml: string, id: string, fileName: string): PlannedRoute {
  const trackGeometry = longestSegment(xml, "trkseg", "trkpt")
  const routeGeometry = longestSegment(xml, "rte", "rtept")
  const waypointGeometry = coordinatesFromXml(xml, "wpt")
  const fullGeometry = trackGeometry.length >= 2
    ? trackGeometry
    : routeGeometry.length >= 2 ? routeGeometry : waypointGeometry
  if (fullGeometry.length < 2) throw new Error("No route, track, or waypoint path with at least two valid coordinates")
  const geometry = fullGeometry.length > 50_000
    ? fullGeometry.filter((_, index) => index % Math.ceil(fullGeometry.length / 49_999) === 0 || index === fullGeometry.length - 1)
    : fullGeometry
  const distance = geometryDistance(geometry)
  const analysis = analyzeGeometry(geometry)
  const fallbackName = fileName.replace(/\.gpx$/i, "").replaceAll(/[-_]+/g, " ").trim()
  const name = decodedName(xml, "metadata") || decodedName(xml, "trk") || decodedName(xml, "rte") || fallbackName
  return {
    id,
    name: (name || "Imported ride").slice(0, 160),
    profile: "scenic",
    geometry,
    waypoints: [
      { lat: geometry[0][1], lon: geometry[0][0], label: "Track start" },
      { lat: geometry.at(-1)![1], lon: geometry.at(-1)![0], label: "Track finish" }
    ],
    instructions: [],
    distanceMiles: Number((distance / 1609.344).toFixed(2)),
    durationMinutes: Number((distance / 1609.344 / 40 * 60).toFixed(2)),
    ascentMeters: null,
    descentMeters: null,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    previewOnly: false
  }
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

const discovered = execFileSync("rg", ["--files", sourceRoot, "-g", "*.gpx", "-g", "*.GPX"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
}).trim().split("\n").filter(Boolean).filter((filePath) => !filePath.startsWith(outputRoot))

const byHash = new Map<string, { content: Buffer; paths: string[] }>()
for (const filePath of discovered) {
  const content = await readFile(filePath)
  const hash = createHash("sha256").update(content).digest("hex")
  const existing = byHash.get(hash)
  if (existing) existing.paths.push(filePath)
  else byHash.set(hash, { content, paths: [filePath] })
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(routesDirectory, { recursive: true })
await mkdir(rejectedDirectory, { recursive: true })

const routes: CatalogRoute[] = []
const rejected: RejectedFile[] = []
for (const [hash, file] of byHash) {
  const id = `project-gpx-${hash.slice(0, 24)}`
  const primaryPath = file.paths.toSorted((first, second) => first.length - second.length)[0]
  const sources = file.paths.map(relativeSource).toSorted()
  try {
    const route = parseCatalogRoute(file.content.toString("utf8"), id, path.basename(primaryPath))
    await writeFile(path.join(routesDirectory, `${id}.json`), JSON.stringify(route))
    routes.push({
      id,
      name: route.name,
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      twistiness: route.twistiness,
      turnCount: route.turnCount,
      sourceProject: sourceProject(primaryPath),
      sourceFile: relativeSource(primaryPath),
      sources
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "Unknown GPX parsing error"
    await writeFile(path.join(rejectedDirectory, `${id}.gpx`), file.content)
    rejected.push({ id, sourceFile: relativeSource(primaryPath), sources, reason })
  }
}

routes.sort((first, second) => first.name.localeCompare(second.name))
rejected.sort((first, second) => first.sourceFile.localeCompare(second.sourceFile))
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceRoot,
  scannedFiles: discovered.length,
  duplicateFiles: discovered.length - byHash.size,
  uniqueFiles: byHash.size,
  importedRoutes: routes.length,
  rejectedFiles: rejected.length,
  routes,
  rejected
}
await writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2))

console.log(`Scanned ${manifest.scannedFiles} GPX files (${manifest.uniqueFiles} unique).`)
console.log(`Imported ${manifest.importedRoutes} routes; preserved ${manifest.rejectedFiles} rejected files for review.`)
for (const item of rejected.slice(0, 20)) {
  console.log(`- ${item.sourceFile}: ${item.reason}`)
}
if (rejected.length > 20) console.log(`- ...and ${rejected.length - 20} more in manifest.json`)
