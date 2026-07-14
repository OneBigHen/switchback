"use client"

import { CheckCircle, WarningCircle } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { requestTripPlan, RoutingClientError } from "@/lib/client/routing-client"
import { routeToGpx } from "@/lib/routing/gpx"
import { MAX_GPX_IMPORT_BYTES, parseGpxRoute } from "@/lib/routing/gpx-import"
import type { ProjectGpxCatalog, ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import { RouteLibrary, type SavedRoute } from "@/lib/storage/route-library"
import { usePlannerStore, type PlannerPointId } from "@/stores/planner-store"
import { LibraryDrawer } from "./LibraryDrawer"
import { MapStage } from "./MapStage"
import { PlannerDeck } from "./PlannerDeck"
import { RideHud } from "./RideHud"
import { RouteComparison } from "./RouteComparison"

type RouterStatus = "checking" | "ready" | "offline"

export function PlannerShell() {
  const start = usePlannerStore((state) => state.start)
  const finish = usePlannerStore((state) => state.finish)
  const startQuery = usePlannerStore((state) => state.startQuery)
  const finishQuery = usePlannerStore((state) => state.finishQuery)
  const armedPoint = usePlannerStore((state) => state.armedPoint)
  const profile = usePlannerStore((state) => state.profile)
  const status = usePlannerStore((state) => state.status)
  const plan = usePlannerStore((state) => state.plan)
  const selectedRouteId = usePlannerStore((state) => state.selectedRouteId)
  const error = usePlannerStore((state) => state.error)
  const curvatureVisible = usePlannerStore((state) => state.curvatureVisible)
  const surface = usePlannerStore((state) => state.surface)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [projectRoutes, setProjectRoutes] = useState<ProjectGpxRouteSummary[]>([])
  const [routerStatus, setRouterStatus] = useState<RouterStatus>("checking")
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; message: string } | null>(null)
  const [routeRequestGate] = useState(createLatestRequestGate)
  const libraryRef = useRef<RouteLibrary | null>(null)
  if (libraryRef.current == null) {
    libraryRef.current = new RouteLibrary()
  }

  const routes = plan?.routes ?? []
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null

  const refreshLibrary = async () => {
    setSavedRoutes(await libraryRef.current!.list())
  }

  useEffect(() => {
    void refreshLibrary().catch(() => {
      setNotice({ kind: "warning", message: "The local route library could not be opened." })
    })
    void fetch("/api/gpx-library", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Project GPX library unavailable")
        return response.json() as Promise<ProjectGpxCatalog>
      })
      .then((catalog) => setProjectRoutes(catalog.routes))
      .catch(() => setProjectRoutes([]))
  }, [])

  useEffect(() => {
    let disposed = false
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" })
        if (!disposed) setRouterStatus(response.ok ? "ready" : "offline")
      } catch {
        if (!disposed) setRouterStatus("offline")
      }
    }
    void check()
    const interval = window.setInterval(check, 15_000)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3_200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const handlePointChange = (id: PlannerPointId, point: Waypoint) => {
    routeRequestGate.invalidate()
    usePlannerStore.getState().setPoint(id, point)
  }

  const handlePlan = async () => {
    const current = usePlannerStore.getState()
    if (!current.start || !current.finish) {
      current.failRouting({ code: "MISSING_WAYPOINTS", message: "Choose a start and finish first." })
      return
    }
    const requestId = routeRequestGate.begin()
    current.beginRouting()
    try {
      const nextPlan = await requestTripPlan({
        profile: current.profile,
        compare: true,
        points: [current.start, current.finish]
      })
      if (routeRequestGate.isCurrent(requestId)) {
        usePlannerStore.getState().applyPlan(nextPlan)
        if (nextPlan.warnings.length > 0) {
          setNotice({ kind: "warning", message: nextPlan.warnings.join(" ") })
        }
      }
    } catch (caught) {
      if (!routeRequestGate.isCurrent(requestId)) return
      const failure = caught instanceof RoutingClientError
        ? caught
        : new RoutingClientError("This trip could not be routed.", "ROUTE_PLANNING_FAILED", 500)
      usePlannerStore.getState().failRouting({ code: failure.code, message: failure.message })
    }
  }

  const handleSave = async (route: PlannedRoute) => {
    try {
      await libraryRef.current!.save(route)
      await refreshLibrary()
      setNotice({ kind: "success", message: "Route saved on this device." })
    } catch {
      setNotice({ kind: "warning", message: "This route could not be saved on this device." })
    }
  }

  const handleExport = (route: PlannedRoute) => {
    const blob = new Blob([routeToGpx(route)], { type: "application/gpx+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "switchback-route"}.gpx`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // WebKit can start consuming the object URL after the click handler has
    // returned. Revoking it synchronously makes GPX downloads intermittent on
    // iOS/Safari, especially while the map is rendering.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    setNotice({ kind: "success", message: "GPX track exported." })
  }

  const handleLoad = (route: SavedRoute) => {
    routeRequestGate.invalidate()
    if (route.waypoints[0]) usePlannerStore.getState().setPoint("start", route.waypoints[0])
    if (route.waypoints.at(-1)) usePlannerStore.getState().setPoint("finish", route.waypoints.at(-1)!)
    usePlannerStore.getState().applyPlan({
      selectedRouteId: route.id,
      routes: [route],
      warnings: []
    })
    usePlannerStore.getState().setSurface("planner")
  }

  const handleDelete = async (route: SavedRoute) => {
    try {
      await libraryRef.current!.remove(route.id)
      await refreshLibrary()
      setNotice({ kind: "warning", message: `${route.name} removed from this device.` })
    } catch {
      setNotice({ kind: "warning", message: `${route.name} could not be removed.` })
    }
  }

  const handleLoadProject = async (summary: ProjectGpxRouteSummary) => {
    try {
      const existing = await libraryRef.current!.get(summary.id)
      if (existing) {
        handleLoad(existing)
        return
      }
      const response = await fetch(`/api/gpx-library?id=${encodeURIComponent(summary.id)}`)
      if (!response.ok) throw new Error("The imported GPX route could not be loaded.")
      const imported = await response.json() as PlannedRoute
      if (imported.id !== summary.id || !Array.isArray(imported.geometry) || imported.geometry.length < 2) {
        throw new Error("The imported GPX route is invalid.")
      }
      const saved = await libraryRef.current!.save(imported, `Imported from ${summary.sourceFile}`)
      await refreshLibrary()
      handleLoad(saved)
      setNotice({ kind: "success", message: `${saved.name} added to this device.` })
    } catch (caught) {
      setNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "The imported GPX route could not be loaded."
      })
    }
  }

  const handleImport = async (file: File) => {
    if (file.size > MAX_GPX_IMPORT_BYTES) {
      setNotice({ kind: "warning", message: "GPX imports must be 5 MB or smaller." })
      return
    }
    try {
      const imported = parseGpxRoute(await file.text(), {
        fileName: file.name,
        byteLength: file.size
      })
      await libraryRef.current!.save(imported)
      await refreshLibrary()
      setNotice({ kind: "success", message: `${imported.name} imported to your library.` })
    } catch (caught) {
      setNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "The GPX file could not be imported."
      })
    }
  }

  const handleMapPick = (point: Waypoint) => {
    const id = usePlannerStore.getState().armedPoint
    if (id) handlePointChange(id, point)
  }

  return (
    <main className="planner-shell" id="top">
      <MapStage
        routes={routes}
        selectedRouteId={selectedRouteId}
        start={start}
        finish={finish}
        armedPoint={armedPoint}
        curvatureVisible={curvatureVisible}
        rideMode={surface === "ride"}
        onMapPick={handleMapPick}
      />

      {surface !== "ride" ? (
        <PlannerDeck
          start={start}
          finish={finish}
          startQuery={startQuery}
          finishQuery={finishQuery}
          armedPoint={armedPoint}
          profile={profile}
          status={status}
          error={error}
          curvatureVisible={curvatureVisible}
          routerStatus={routerStatus}
          savedCount={savedRoutes.length + projectRoutes.length}
          onPointChange={handlePointChange}
          onPointQueryChange={(id, query) => {
            routeRequestGate.invalidate()
            usePlannerStore.getState().setPointQuery(id, query)
          }}
          onArm={(id) => usePlannerStore.getState().armPoint(armedPoint === id ? null : id)}
          onSwap={() => {
            if (start && finish) {
              routeRequestGate.invalidate()
              usePlannerStore.getState().setPoint("start", finish)
              usePlannerStore.getState().setPoint("finish", start)
            }
          }}
          onProfileChange={(nextProfile) => {
            if (nextProfile === usePlannerStore.getState().profile) return
            routeRequestGate.invalidate()
            usePlannerStore.getState().setProfile(nextProfile)
          }}
          onCurvatureChange={(visible) => usePlannerStore.getState().setCurvatureVisible(visible)}
          onPlan={() => void handlePlan()}
          onOpenLibrary={() => usePlannerStore.getState().setSurface("library")}
        >
          {routes.length > 0 && selectedRouteId ? (
            <RouteComparison
              routes={routes}
              selectedId={selectedRouteId}
              onSelect={(id) => usePlannerStore.getState().selectRoute(id)}
              onSave={(route) => void handleSave(route)}
              onExport={handleExport}
              onRide={(route) => {
                usePlannerStore.getState().selectRoute(route.id)
                usePlannerStore.getState().setSurface("ride")
              }}
            />
          ) : null}
        </PlannerDeck>
      ) : null}
      {surface === "library" ? (
        <LibraryDrawer
          routes={savedRoutes}
          projectRoutes={projectRoutes}
          onClose={() => usePlannerStore.getState().setSurface("planner")}
          onLoad={handleLoad}
          onLoadProject={(route) => void handleLoadProject(route)}
          onDelete={(route) => void handleDelete(route)}
          onImport={(file) => void handleImport(file)}
        />
      ) : null}
      {surface === "ride" && selectedRoute ? (
        <RideHud route={selectedRoute} onExit={() => usePlannerStore.getState().setSurface("planner")} />
      ) : null}

      {notice ? (
        <div className={`app-notice notice-${notice.kind}`} role="status">
          {notice.kind === "success" ? <CheckCircle weight="fill" aria-hidden="true" /> : <WarningCircle weight="fill" aria-hidden="true" />}
          {notice.message}
        </div>
      ) : null}
    </main>
  )
}
