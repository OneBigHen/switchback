import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import { routeToGpx, type GpxExportVariant } from "@/lib/routing/gpx"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import type { PlannedRoute } from "@/lib/routing/types"
import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import type { SavedRoute } from "@/lib/storage/route-library"
import {
  createGpxRoadLock,
  type RoadLock,
  type RoadLockMode
} from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

export interface RouteExchangeNotice {
  kind: "success" | "warning"
  message: string
}

interface RouteExchangeLibrary {
  save(route: PlannedRoute): Promise<unknown>
  remove(id: string): Promise<void>
  get(id: string): Promise<SavedRoute | undefined>
}

interface RouteExchangeActionsOptions {
  library: RouteExchangeLibrary
  refresh(): Promise<void>
  onNotice(notice: RouteExchangeNotice): void
  onLoad(route: PlannedRoute): void
  parseFile?(file: File): Promise<PlannedRoute>
  fetcher?: typeof fetch
  maxImportBytes?: number
  /** Fall-back graph/region provenance stored on GPX-imported road locks. */
  defaultLockSourceRegionId?: string
  defaultLockSourceGraphVersion?: string
  /**
   * Snapshot copied onto GPX-imported road locks. Defaults to a permissive
   * "unknown but routable" snapshot because a GPX file carries no OSM tags;
   * precedence-level checks still reject motorcycle=no or active closures
   * when an actual rematch reveals them.
   */
  buildImportedLockAccessSnapshot?: () => RoadAccessSnapshot
}

function downloadName(route: PlannedRoute, variant: GpxExportVariant): string {
  const base = route.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "switchback-route"
  return `${base}${variant === "track" ? "" : `-${variant}`}.gpx`
}

/** Permissive snapshot for GPX-imported road locks until a rematch fills it in. */
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

export interface ImportRoadLockOptions {
  mode: RoadLockMode
  displayName?: string
  sourceRegionId?: string
  sourceGraphVersion?: string
}

export function createRouteExchangeActions({
  library,
  refresh,
  onNotice,
  onLoad,
  parseFile = parseRouteFileInWorker,
  fetcher = fetch,
  maxImportBytes = MAX_GPX_IMPORT_BYTES,
  defaultLockSourceRegionId = "gpx-import",
  defaultLockSourceGraphVersion = "gpx-import",
  buildImportedLockAccessSnapshot = defaultImportedLockAccessSnapshot
}: RouteExchangeActionsOptions) {
  return {
    async saveRoute(route: PlannedRoute) {
      try {
        await library.save(route)
        await refresh()
        onNotice({ kind: "success", message: "Route saved on this device." })
      } catch {
        onNotice({ kind: "warning", message: "This route could not be saved on this device." })
      }
    },

    exportRoute(route: PlannedRoute, variant: GpxExportVariant = "track") {
      const blob = new Blob([routeToGpx(route, { variant })], { type: "application/gpx+xml;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = downloadName(route, variant)
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      onNotice({ kind: "success", message: `GPX ${variant} exported.` })
    },

    async deleteRoute(route: SavedRoute) {
      try {
        await library.remove(route.id)
        await refresh()
        onNotice({ kind: "warning", message: `${route.name} removed from this device.` })
      } catch {
        onNotice({ kind: "warning", message: `${route.name} could not be removed.` })
      }
    },

    async loadProject(summary: ProjectGpxRouteSummary) {
      try {
        const existing = await library.get(summary.id)
        if (existing) {
          onLoad(existing)
          return
        }
        const response = await fetcher(`/api/gpx-library?id=${encodeURIComponent(summary.id)}`)
        if (!response.ok) throw new Error("The imported GPX route could not be loaded.")
        const imported = await response.json() as PlannedRoute
        if (imported.id !== summary.id || !Array.isArray(imported.geometry) || imported.geometry.length < 2) {
          throw new Error("The imported GPX route is invalid.")
        }
        onLoad(imported)
        onNotice({ kind: "success", message: `${imported.name} loaded from the project library.` })
      } catch (caught) {
        onNotice({
          kind: "warning",
          message: caught instanceof Error ? caught.message : "The imported GPX route could not be loaded."
        })
      }
    },

    async importRoute(file: File) {
      if (file.size > maxImportBytes) {
        onNotice({ kind: "warning", message: "Route imports must be 5 MB or smaller." })
        return
      }
      try {
        const imported = await parseFile(file)
        await library.save(imported)
        await refresh()
        onNotice({ kind: "success", message: `${imported.name} imported to your library. Imported tracks stay intact until you choose to re-route them.` })
      } catch (caught) {
        onNotice({
          kind: "warning",
          message: caught instanceof Error ? caught.message : "The route file could not be imported."
        })
      }
    },

    async importRoadLock(file: File, options: ImportRoadLockOptions): Promise<RoadLock | null> {
      if (file.size > maxImportBytes) {
        onNotice({ kind: "warning", message: "Route imports must be 5 MB or smaller." })
        return null
      }
      try {
        const imported = await parseFile(file)
        const geometry = imported.geometry as Coordinate[]
        if (geometry.length < 2) {
          throw new Error("The imported GPX has no usable track geometry.")
        }
        const orderedAnchors: Coordinate[] = [geometry[0]!, geometry[geometry.length - 1]!]
        const lock = createGpxRoadLock({
          mode: options.mode,
          displayName: options.displayName?.trim() || imported.name,
          edgeIds: [],
          geometry,
          orderedAnchors,
          accessSnapshot: buildImportedLockAccessSnapshot(),
          sourceRegionId: options.sourceRegionId ?? defaultLockSourceRegionId,
          sourceGraphVersion: options.sourceGraphVersion ?? defaultLockSourceGraphVersion
        })
        onNotice({
          kind: "success",
          message: `${imported.name} imported as a ${options.mode === "must" ? "must-use" : "preferred"} road lock. The route card will rematch it against the live graph.`
        })
        return lock
      } catch (caught) {
        onNotice({
          kind: "warning",
          message: caught instanceof Error ? caught.message : "The GPX file could not be imported as a road lock."
        })
        return null
      }
    }
  }
}
