import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import { routeToGpx, type GpxExportVariant } from "@/lib/routing/gpx"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import type { PlannedRoute } from "@/lib/routing/types"
import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import type { SavedRoute } from "@/lib/storage/route-library"

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
}

function downloadName(route: PlannedRoute, variant: GpxExportVariant): string {
  const base = route.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "switchback-route"
  return `${base}${variant === "track" ? "" : `-${variant}`}.gpx`
}

export function createRouteExchangeActions({
  library,
  refresh,
  onNotice,
  onLoad,
  parseFile = parseRouteFileInWorker,
  fetcher = fetch,
  maxImportBytes = MAX_GPX_IMPORT_BYTES
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
    }
  }
}
