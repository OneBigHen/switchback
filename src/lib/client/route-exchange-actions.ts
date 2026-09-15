import { catalogCopyId, fetchCatalogRoute } from "@/lib/gpx/catalog-client"
import { recordedRideToGpx, routeToGpx, type GpxExportVariant } from "@/lib/routing/gpx"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import type { PlannedRoute } from "@/lib/routing/types"
import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import type { SavedRoute, SavedRouteLibraryProvenance, SavedRouteSourceFormat } from "@/lib/storage/route-library"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import {
  createGpxRoadLock,
  type RoadLock,
  type RoadLockMode
} from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"
import { telemetry as defaultTelemetry, type TelemetryController } from "@/lib/telemetry/client"
import type { TelemetryErrorProperties, TelemetryEventName, TelemetryEventProperties, TelemetryFailureClass, TelemetryFileSizeBand, TelemetryGpxExportVariant, TelemetryGpxFormat, TelemetryGpxProperties } from "@/lib/telemetry/events"
import { routeTelemetryProperties, telemetryCountBand, telemetryFailureClass } from "@/lib/telemetry/route"

export interface RouteExchangeNotice {
  kind: "success" | "warning"
  message: string
}

interface RouteExchangeLibrary {
  save(route: PlannedRoute, notes?: string, libraryProvenance?: SavedRouteLibraryProvenance): Promise<unknown>
  remove(id: string): Promise<void>
  get(id: string): Promise<SavedRoute | undefined>
  findCatalogCopy(sourceCatalogRouteId: string): Promise<SavedRoute | undefined>
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
  /**
   * Shared Route Library entries opened in this planner session. The caller
   * owns it so it survives re-creating these actions on every render. A
   * planner Save of one of these is a Save to My Rides: it becomes a separate,
   * duplicate-safe catalog copy, never a row under the shared catalog id.
   */
  openedCatalogRouteIds?: Set<string>
  /**
   * Called when a Route Library load starts; the returned check reports
   * whether the rider has authored planner changes since, in which case the
   * late load is dropped instead of replacing their work. It must not count
   * non-rider boot work (draft recovery, a location fix): a general request
   * gate advances for those and would drop the rider's explicit Open in Planner.
   */
  beginCatalogOpen?: () => () => boolean
  /** Injectable observability seam; telemetry remains best effort. */
  telemetry?: TelemetryController
}

function downloadName(route: PlannedRoute, variant: GpxExportVariant): string {
  const base = route.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "opengravel-route"
  return `${base}${variant === "track" ? "" : `-${variant}`}.gpx`
}

/** Explicit ownership record for a route the rider imported from a file. */
function importedFileProvenance(file: File): SavedRouteLibraryProvenance {
  const extension = /\.(gpx|kml|kmz)$/i.exec(file.name)?.[1]?.toLowerCase()
  const sourceFormat: SavedRouteSourceFormat = extension === "kml" || extension === "kmz" ? extension : "gpx"
  return { kind: "imported-file", sourceFormat, sourceFileName: file.name, importedAt: new Date().toISOString() }
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

function telemetryFileSizeBand(bytes: number): TelemetryFileSizeBand {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown"
  if (bytes < 100 * 1024) return "0-100kb"
  if (bytes < 1024 * 1024) return "100kb-1mb"
  if (bytes <= MAX_GPX_IMPORT_BYTES) return "1-5mb"
  return "5mb+"
}

function telemetryGpxFormat(fileName: string): TelemetryGpxFormat {
  const extension = /\.(gpx|kml|kmz)$/i.exec(fileName)?.[1]?.toLowerCase()
  return extension === "gpx" || extension === "kml" || extension === "kmz" ? extension : "unknown"
}

function captureTelemetry<EventName extends TelemetryEventName>(
  controller: TelemetryController,
  eventName: EventName,
  properties: TelemetryEventProperties<EventName>
): void {
  try {
    controller.capture(eventName, properties)
  } catch {
    // Product behavior must continue when telemetry is blocked or unavailable.
  }
}

function gpxErrorProperties(errorClass: TelemetryFailureClass): TelemetryErrorProperties {
  return {
    error_class: errorClass,
    feature: "gpx",
    surface: "gpx",
    recoverable: true,
    recovery_path: "edit-input",
    user_impact: "blocked"
  }
}

function importedGpxProperties(file: File): TelemetryGpxProperties {
  return {
    source_class: "imported-file",
    format: telemetryGpxFormat(file.name),
    file_size_band: telemetryFileSizeBand(file.size)
  }
}

function exportedRouteProperties(
  route: PlannedRoute,
  exportVariant: TelemetryGpxExportVariant
): TelemetryGpxProperties {
  return {
    ...routeTelemetryProperties(route, [route]),
    source_class: "saved-route",
    format: "gpx",
    export_variant: exportVariant,
    point_count_band: telemetryCountBand(route.geometry.length),
    route_count_band: "1"
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
  buildImportedLockAccessSnapshot = defaultImportedLockAccessSnapshot,
  openedCatalogRouteIds = new Set<string>(),
  beginCatalogOpen = () => () => false,
  telemetry: telemetryController = defaultTelemetry
}: RouteExchangeActionsOptions) {
  return {
    async saveRoute(route: PlannedRoute) {
      try {
        if (openedCatalogRouteIds.has(route.id)) {
          const existing = await library.findCatalogCopy(route.id)
          if (existing) {
            onNotice({ kind: "success", message: `${route.name} is already in My Rides.` })
            return
          }
          await library.save(
            { ...route, id: catalogCopyId(route.id) },
            "",
            { kind: "catalog-copy", sourceCatalogRouteId: route.id }
          )
          await refresh()
          captureTelemetry(telemetryController, "route_saved", routeTelemetryProperties(route, [route]))
          onNotice({ kind: "success", message: `${route.name} saved to My Rides.` })
          return
        }
        await library.save(route)
        await refresh()
        captureTelemetry(telemetryController, "route_saved", routeTelemetryProperties(route, [route]))
        onNotice({ kind: "success", message: "Route saved on this device." })
      } catch {
        onNotice({ kind: "warning", message: "This route could not be saved on this device." })
      }
    },

    exportRoute(route: PlannedRoute, variant: GpxExportVariant = "track") {
      try {
        const blob = new Blob([routeToGpx({ ...route, creatorNotes: route.gpxIntelligence?.creatorNotes }, { variant })], { type: "application/gpx+xml;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = downloadName(route, variant)
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
        captureTelemetry(telemetryController, "gpx_exported", {
          ...exportedRouteProperties(route, variant),
          file_size_band: telemetryFileSizeBand(blob.size)
        })
        onNotice({ kind: "success", message: `GPX ${variant} exported.` })
      } catch (caught) {
        onNotice({ kind: "warning", message: caught instanceof Error ? caught.message : "GPX export failed." })
      }
    },

    exportRecordedRide(ride: RecordedRide) {
      try {
        const blob = new Blob([recordedRideToGpx(ride)], { type: "application/gpx+xml;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = downloadName({ ...ride.route, name: ride.routeName }, "recorded")
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
        captureTelemetry(telemetryController, "gpx_exported", {
          ...exportedRouteProperties(ride.route, "recorded"),
          source_class: "recorded-ride",
          point_count_band: telemetryCountBand(ride.points.length),
          file_size_band: telemetryFileSizeBand(blob.size)
        })
        onNotice({ kind: "success", message: "GPX recorded ride exported." })
      } catch (caught) {
        onNotice({ kind: "warning", message: caught instanceof Error ? caught.message : "Recorded ride export failed." })
      }
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

    /** Route Library → Open in Planner. Loads the shared entry; never saves it. */
    async openCatalogRoute(catalogRouteId: string) {
      const superseded = beginCatalogOpen()
      const workflow = telemetryController.startWorkflow("gpx_library_to_route", {
        source_class: "catalog",
        format: "gpx"
      })
      try {
        const catalogRoute = await fetchCatalogRoute(catalogRouteId, fetcher)
        if (superseded()) {
          workflow?.abandon({ reason: "superseded", success: false })
          return
        }
        openedCatalogRouteIds.add(catalogRoute.id)
        onLoad(catalogRoute)
        captureTelemetry(telemetryController, "gpx_project_opened", {
          source_class: "catalog",
          format: "gpx",
          ...routeTelemetryProperties(catalogRoute, [catalogRoute])
        })
        captureTelemetry(telemetryController, "gpx_route_loaded", {
          source_class: "catalog",
          format: "gpx",
          ...routeTelemetryProperties(catalogRoute, [catalogRoute])
        })
        onNotice({
          kind: "success",
          message: `${catalogRoute.name} opened from the Route Library. It is not in My Rides until you save it.`
        })
        workflow?.end("success", {
          success: true,
          point_count_band: telemetryCountBand(catalogRoute.geometry.length),
          route_count_band: "1"
        })
      } catch (caught) {
        if (superseded()) {
          workflow?.abandon({ reason: "superseded", success: false })
          return
        }
        workflow?.fail(telemetryFailureClass(caught instanceof Error ? caught.message : undefined), { success: false })
        onNotice({
          kind: "warning",
          message: caught instanceof Error ? caught.message : "That Route Library entry could not be opened."
        })
      }
    },

    /** Route Library → Open saved copy. Loads a rider-owned My Rides row by id. */
    async openSavedRoute(savedRouteId: string) {
      const workflow = telemetryController.startWorkflow("gpx_library_to_route", {
        source_class: "saved-route",
        format: "gpx"
      })
      try {
        const saved = await library.get(savedRouteId)
        if (!saved) {
          workflow?.fail("storage-failure", { success: false })
          onNotice({ kind: "warning", message: "That ride is no longer in My Rides on this device." })
          return
        }
        onLoad(saved)
        captureTelemetry(telemetryController, "gpx_project_opened", {
          source_class: "saved-route",
          format: "gpx",
          ...routeTelemetryProperties(saved, [saved])
        })
        captureTelemetry(telemetryController, "gpx_route_loaded", {
          source_class: "saved-route",
          format: "gpx",
          ...routeTelemetryProperties(saved, [saved])
        })
        workflow?.end("success", {
          success: true,
          point_count_band: telemetryCountBand(saved.geometry.length),
          route_count_band: "1"
        })
      } catch {
        workflow?.fail("storage-failure", { success: false })
        onNotice({ kind: "warning", message: "My Rides could not be opened on this device." })
      }
    },

    async importRoute(file: File) {
      const startedAt = Date.now()
      const importProperties = importedGpxProperties(file)
      const workflow = telemetryController.startWorkflow("gpx_import", {
        source_class: importProperties.source_class ?? "unknown",
        format: importProperties.format ?? "unknown",
        file_size_band: importProperties.file_size_band ?? "unknown"
      })
      captureTelemetry(telemetryController, "gpx_import_started", importProperties)
      if (file.size > maxImportBytes) {
        captureTelemetry(telemetryController, "gpx_import_failed", {
          ...importProperties,
          failure_class: "parse-failure",
          parse_duration_ms: Math.max(0, Date.now() - startedAt)
        })
        workflow?.fail("parse-failure", { success: false })
        captureTelemetry(telemetryController, "app_error", gpxErrorProperties("parse-failure"))
        onNotice({ kind: "warning", message: "Route imports must be 5 MB or smaller." })
        return
      }
      try {
        const imported = await parseFile(file)
        await library.save(imported, "", importedFileProvenance(file))
        await refresh()
        captureTelemetry(telemetryController, "gpx_import_succeeded", {
          ...importProperties,
          point_count_band: telemetryCountBand(imported.geometry.length),
          route_count_band: "1",
          parse_duration_ms: Math.max(0, Date.now() - startedAt)
        })
        workflow?.end("success", {
          success: true,
          point_count_band: telemetryCountBand(imported.geometry.length),
          route_count_band: "1"
        })
        onNotice({ kind: "success", message: `${imported.name} imported to your library. Imported tracks stay intact until you choose to re-route them.` })
      } catch (caught) {
        const failureClass = telemetryFailureClass(caught instanceof Error ? caught.message : undefined)
        captureTelemetry(telemetryController, "gpx_import_failed", {
          ...importProperties,
          failure_class: failureClass,
          parse_duration_ms: Math.max(0, Date.now() - startedAt)
        })
        workflow?.fail(failureClass, { success: false })
        captureTelemetry(telemetryController, "app_error", gpxErrorProperties(failureClass))
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
