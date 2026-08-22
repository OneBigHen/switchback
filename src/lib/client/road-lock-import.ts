import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import {
  createGpxRoadLock,
  type RoadLock,
  type RoadLockMode
} from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"

export interface GpxRoadLockImportOptions {
  mode: RoadLockMode
  displayName?: string
  sourceRegionId?: string
  sourceGraphVersion?: string
}

export interface GpxRoadLockImportDependencies {
  parseFile?: typeof parseRouteFileInWorker
  maxImportBytes?: number
  buildAccessSnapshot?: () => RoadAccessSnapshot
}

function defaultImportedLockAccessSnapshot(): RoadAccessSnapshot {
  return {
    highwayClass: "unknown",
    motorcycleAccess: "unknown",
    generalAccess: "unknown",
    surface: "unknown",
    smoothness: "unknown",
    tracktype: "unknown",
    maxweightTonnes: null,
    seasonalUndated: false,
    activeConditions: [],
    routable: true
  }
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90
}

export async function importGpxRoadLock(
  file: File,
  options: GpxRoadLockImportOptions,
  dependencies: GpxRoadLockImportDependencies = {}
): Promise<RoadLock> {
  const maxImportBytes = dependencies.maxImportBytes ?? MAX_GPX_IMPORT_BYTES
  if (file.size > maxImportBytes) {
    throw new Error("Route imports must be 5 MB or smaller.")
  }

  const parseFile = dependencies.parseFile ?? parseRouteFileInWorker
  const imported: PlannedRoute = await parseFile(file)
  const geometry = imported.geometry as unknown
  if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(isCoordinate)) {
    throw new Error("The imported GPX has no usable track geometry.")
  }

  return createGpxRoadLock({
    mode: options.mode,
    displayName: options.displayName?.trim() || imported.name,
    edgeIds: [],
    geometry,
    orderedAnchors: [geometry[0]!, geometry.at(-1)!],
    accessSnapshot: dependencies.buildAccessSnapshot?.() ?? defaultImportedLockAccessSnapshot(),
    sourceRegionId: options.sourceRegionId ?? "gpx-import",
    sourceGraphVersion: options.sourceGraphVersion ?? "gpx-import"
  })
}
