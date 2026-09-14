import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  CATALOG_EXCLUSION_LABEL,
  catalogExclusions,
  splitTrackParent,
  type CatalogExclusionReason
} from "../src/lib/gpx/catalog-curation"

/**
 * Applies the catalog curation rules to a library that was imported before
 * they existed.
 *
 *   npm run gpx:curate                   # dry run against data/gpx-library
 *   npm run gpx:curate -- --apply        # move rejected routes aside
 *   npm run gpx:curate -- <root> --apply
 *
 * Nothing is deleted. A rejected route's JSON moves to `rejected/<id>/`, and
 * a source file whose every ride was rejected moves its originals with it; the
 * manifest records each move with its reason, so restoring is a move back.
 * Run `npm run atlas:refresh` afterwards so poster art matches the manifest.
 */

interface ManifestRoute {
  id: string
  name: string
  distanceMiles: number
  sourceFile?: string
  sources?: string[]
  [key: string]: unknown
}

interface ManifestRejected {
  id: string
  sourceFile: string
  sources: string[]
  reason: string
  curation?: CatalogExclusionReason
  curatedAt?: string
}

interface Manifest {
  importedRoutes?: number
  rejectedFiles?: number
  routes: ManifestRoute[]
  rejected?: ManifestRejected[]
  [key: string]: unknown
}

export interface CurationDecision {
  id: string
  name: string
  distanceMiles: number
  reason: CatalogExclusionReason
  label: string
  sourceFile: string
}

export interface CurationResult {
  root: string
  applied: boolean
  keptRoutes: number
  rejected: CurationDecision[]
  /** Source-file ids whose originals moved because none of their rides remain. */
  movedOriginals: string[]
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/** A route's file id: split rides share the id of the file they came from. */
function fileIdOf(routeId: string): string {
  return splitTrackParent(routeId) ?? routeId
}

export async function curateGpxLibrary(
  root: string,
  options: { apply?: boolean; now?: Date } = {}
): Promise<CurationResult> {
  const manifestPath = path.join(root, "manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest
  const exclusions = catalogExclusions(manifest.routes)
  const rejectedIds = new Set(exclusions.map(({ route }) => route.id))
  const kept = manifest.routes.filter((route) => !rejectedIds.has(route.id))
  const keptFiles = new Set(kept.map((route) => fileIdOf(route.id)))
  const orphanedFiles = [...new Set(exclusions.map(({ route }) => fileIdOf(route.id)))]
    .filter((fileId) => !keptFiles.has(fileId))
    .toSorted()

  const decisions: CurationDecision[] = exclusions.map(({ route, reason }) => ({
    id: route.id,
    name: route.name,
    distanceMiles: route.distanceMiles,
    reason,
    label: CATALOG_EXCLUSION_LABEL[reason],
    sourceFile: route.sourceFile ?? ""
  }))
  const result: CurationResult = {
    root,
    applied: false,
    keptRoutes: kept.length,
    rejected: decisions,
    movedOriginals: orphanedFiles
  }
  if (!options.apply || decisions.length === 0) return result

  const curatedAt = (options.now ?? new Date()).toISOString()
  for (const { route } of exclusions) {
    const from = path.join(root, "routes", `${route.id}.json`)
    if (!(await exists(from))) continue
    const directory = path.join(root, "rejected", route.id)
    await mkdir(directory, { recursive: true })
    await rename(from, path.join(directory, "route.json"))
  }
  for (const fileId of orphanedFiles) {
    const from = path.join(root, "originals", fileId)
    if (!(await exists(from))) continue
    const target = path.join(root, "rejected", fileId, "originals")
    await mkdir(path.dirname(target), { recursive: true })
    await rm(target, { recursive: true, force: true })
    await rename(from, target)
  }

  const next: Manifest = {
    ...manifest,
    importedRoutes: kept.length,
    rejectedFiles: (manifest.rejected?.length ?? 0) + decisions.length,
    routes: kept,
    rejected: [
      ...manifest.rejected ?? [],
      ...exclusions.map(({ route, reason }) => ({
        id: route.id,
        sourceFile: route.sourceFile ?? "",
        sources: route.sources ?? [],
        reason: CATALOG_EXCLUSION_LABEL[reason],
        curation: reason,
        curatedAt
      }))
    ]
  }
  // Write beside, then swap, so a reader never sees a half-written manifest.
  const staged = `${manifestPath}.curating-${process.pid}`
  await writeFile(staged, JSON.stringify(next, null, 2))
  await rename(staged, manifestPath)
  return { ...result, applied: true }
}

function report(result: CurationResult): void {
  const byReason = new Map<string, CurationDecision[]>()
  for (const decision of result.rejected) {
    byReason.set(decision.label, [...byReason.get(decision.label) ?? [], decision])
  }
  console.log(`${result.applied ? "Curated" : "Dry run for"} ${result.root}`)
  console.log(`Keeps ${result.keptRoutes} routes; ${result.applied ? "moved" : "would move"} ${result.rejected.length} to rejected/.`)
  for (const [label, decisions] of byReason) {
    console.log(`\n${label} (${decisions.length})`)
    for (const decision of decisions.toSorted((left, right) => left.name.localeCompare(right.name))) {
      console.log(`- ${decision.name} · ${decision.distanceMiles} mi · ${decision.id} · ${decision.sourceFile}`)
    }
  }
  if (result.movedOriginals.length > 0) {
    console.log(`\nSource files with no remaining ride: ${result.movedOriginals.length} (originals ${result.applied ? "moved" : "would move"} too)`)
  }
  if (!result.applied && result.rejected.length > 0) console.log("\nRe-run with --apply to move them, then npm run atlas:refresh.")
  if (result.applied) console.log("\nNext: npm run atlas:refresh")
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2)
  const root = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? "data/gpx-library")
  report(await curateGpxLibrary(root, { apply: args.includes("--apply") }))
}
