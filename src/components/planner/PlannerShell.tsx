"use client"

import { CheckCircle, WarningCircle } from "@phosphor-icons/react"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  appNavigationReducer,
  createInitialAppNavigationState,
  type AppTab,
  type ThemePreference
} from "@/lib/client/app-navigation"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { isNightTime } from "@/lib/client/day-phase"
import { type PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import type { ReferenceMap } from "@/lib/client/reference-map"
import {
  applyRiderMapPack,
  defaultRiderLayerSettings,
  type MapStyleId,
  type RiderLayerId,
  type RiderLayerSetting
} from "@/lib/client/map-layers"
import { cancelRoutingRequest, runLatestTripPlan } from "@/lib/client/trip-planning-coordinator"
import { createRouteExchangeActions } from "@/lib/client/route-exchange-actions"
import { buildLoopStopVia, buildRideTripRequest, createPlanningId } from "@/lib/planner/ride-plan-request"
import { routeEditState } from "@/lib/planner/route-edit-state"
import { restorePortableShare } from "@/lib/share/route-share"
import { routePointsFromSketch } from "@/lib/planner/route-sketch"
import type { ProjectGpxCatalog, ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { AvoidArea, PlannedRoute, RouteProfileId, Waypoint } from "@/lib/routing/types"
import { OfflineRoutePackLibrary } from "@/lib/storage/offline-route-pack"
import { RiderPreferenceLibrary } from "@/lib/storage/rider-preference-library"
import { TripPlanLibrary } from "@/lib/storage/trip-plan-library"
import { createTripPlan } from "@/lib/trip/trip-plan"
import type { TripPlan as SavedTripPlan } from "@/lib/trip/trip-plan"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import { buildOfflinePackCorridor } from "@/lib/client/offline-pack-coordinator"
import { navigationStore } from "@/stores/navigation-store"
import { usePlannerStore, type PlannerPointId } from "@/stores/planner-store"
import { LibraryDrawer } from "./LibraryDrawer"
import { MapStage } from "./MapStage"
import { PlannerDeck, type PlanMode, type RideIntentStatus } from "./PlannerDeck"
import { RideHud } from "./RideHud"
import { RouteComparison } from "./RouteComparison"
import { usePlannerLibraries } from "./usePlannerLibraries"
import { usePlannerHome } from "./usePlannerHome"
import { usePlannerRideIntent } from "./usePlannerRideIntent"
import { usePlannerRideResearch } from "./usePlannerRideResearch"
import { usePlannerLocationSeed } from "./usePlannerLocationSeed"
import { usePlannerRideActions } from "./usePlannerRideActions"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import { buildPlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RegionDownloadsPanel } from "./RegionDownloadsPanel"
import { AppNavigation } from "@/components/shell/AppNavigation"
import { ProfilePanel } from "@/components/shell/ProfilePanel"
import { RecordPanel } from "@/components/shell/RecordPanel"

function normalizedSegmentProfiles(
  profiles: RouteProfileId[],
  count: number,
  fallback: RouteProfileId
): RouteProfileId[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => profiles[index] ?? fallback)
}

function initialThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "auto"
  const stored = localStorage.getItem("switchback:theme")
  return stored === "light" || stored === "dark" ? stored : "auto"
}

function recordedDistanceMiles(points: Array<{ coordinate: [number, number] }>): number {
  const radians = (value: number) => value * Math.PI / 180
  let meters = 0
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!.coordinate
    const current = points[index]!.coordinate
    const latitudeDelta = radians(current[1] - previous[1])
    const longitudeDelta = radians(current[0] - previous[0])
    const firstLatitude = radians(previous[1])
    const secondLatitude = radians(current[1])
    const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
    meters += 2 * 6_371_000 * Math.asin(Math.sqrt(a))
  }
  return meters / 1609.344
}

export function PlannerShell() {
  const start = usePlannerStore((state) => state.start)
  const finish = usePlannerStore((state) => state.finish)
  const via = usePlannerStore((state) => state.via)
  const startQuery = usePlannerStore((state) => state.startQuery)
  const finishQuery = usePlannerStore((state) => state.finishQuery)
  const armedPoint = usePlannerStore((state) => state.armedPoint)
  const profile = usePlannerStore((state) => state.profile)
  const bikeProfile = usePlannerStore((state) => state.bikeProfile)
  const roadLocks = usePlannerStore((state) => state.roadLocks)
  const status = usePlannerStore((state) => state.status)
  const plan = usePlannerStore((state) => state.plan)
  const selectedRouteId = usePlannerStore((state) => state.selectedRouteId)
  const isRecalculating = usePlannerStore((state) => state.isRecalculating)
  const error = usePlannerStore((state) => state.error)
  const curvatureVisible = usePlannerStore((state) => state.curvatureVisible)
  const surface = usePlannerStore((state) => state.surface)
  const canUndoRoutePoints = usePlannerStore((state) => state.canUndoRoutePoints)
  const canRedoRoutePoints = usePlannerStore((state) => state.canRedoRoutePoints)
  const [projectRoutes, setProjectRoutes] = useState<ProjectGpxRouteSummary[]>([])
  const [savedTrips, setSavedTrips] = useState<SavedTripPlan[]>([])
  const [restoredTrip, setRestoredTrip] = useState<SavedTripPlan | null>(null)
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; message: string } | null>(null)
  const [planMode, setPlanMode] = useState<PlanMode>("destination")
  const [targetMinutes, setTargetMinutes] = useState(120)
  const [avoidHighways, setAvoidHighways] = useState(false)
  const [avoidAreas, setAvoidAreas] = useState<AvoidArea[]>([])
  const [segmentProfiles, setSegmentProfiles] = useState<RouteProfileId[]>([])
  const [intentStatus, setIntentStatus] = useState<RideIntentStatus>("idle")
  const [intentSummary, setIntentSummary] = useState<string | null>(null)
  const [stopIdeas, setStopIdeas] = useState<PlaceIdeasResult | null>(null)
  const [researchStatus, setResearchStatus] = useState<"idle" | "researching">("idle")
  const [researchSources, setResearchSources] = useState<RideResearchSource[]>([])
  const [unpavedVisible, setUnpavedVisible] = useState(true)
  const [mapStyle, setMapStyle] = useState<MapStyleId>("clean")
  const [navigation, dispatchNavigation] = useReducer(
    appNavigationReducer,
    undefined,
    () => createInitialAppNavigationState(initialThemePreference())
  )

  const autoNightRef = useRef(true)
  const [riderLayers, setRiderLayers] = useState<RiderLayerSetting[]>(() => defaultRiderLayerSettings().map((layer) => ({
    ...layer,
    visible: layer.id === "curvature" || layer.id === "unpaved"
  })))
  const [routeVisibility, setRouteVisibility] = useState<"standard" | "high-contrast">("standard")
  const [referenceMap, setReferenceMap] = useState<ReferenceMap | null>(null)
  const [rideOriginalRoute, setRideOriginalRoute] = useState<PlannedRoute | null>(null)
  const [addingVia, setAddingVia] = useState(false)
  const [sketching, setSketching] = useState(false)
  const [routeRequestGate] = useState(() => {
    const base = createLatestRequestGate()
    return {
      ...base,
      // Every invalidation (point edit, clear, load, ride start) also aborts
      // the in-flight provider work instead of leaving it running to waste
      // the host. A fresh run creates its own controller.
      invalidate: () => {
        base.invalidate()
        cancelRoutingRequest()
        // A manual edit, clear, or load ends the active planning lifecycle
        // and restores any retained route.
        usePlannerStore.getState().cancelPlanning()
      }
    }
  })
  const loopSeed = useRef(17)
  const offlinePackLibraryRef = useRef<OfflineRoutePackLibrary | null>(null)
  const riderPreferenceLibraryRef = useRef<RiderPreferenceLibrary | null>(null)
  const tripPlanLibraryRef = useRef<TripPlanLibrary | null>(null)
  if (offlinePackLibraryRef.current == null) {
    offlinePackLibraryRef.current = new OfflineRoutePackLibrary()
  }
  if (riderPreferenceLibraryRef.current == null) {
    riderPreferenceLibraryRef.current = new RiderPreferenceLibrary()
  }
  if (tripPlanLibraryRef.current == null) tripPlanLibraryRef.current = new TripPlanLibrary()
  useEffect(() => { void tripPlanLibraryRef.current!.list().then(setSavedTrips).catch(() => undefined) }, [])
  const showStorageWarning = useCallback((message: string) => {
    setNotice({ kind: "warning", message })
  }, [])
  const { home, useHome, saveHome, clearHome } = usePlannerHome({
    invalidateRequests: routeRequestGate.invalidate,
    setStart: (point) => usePlannerStore.getState().setPoint("start", point),
    onNotice: setNotice
  })
  const {
    savedRoutes,
    mapPacks,
    recordedRides,
    routeLibrary,
    mapPackLibrary,
    rideJournalLibrary,
    refreshRoutes: refreshLibrary,
    refreshMapPacks,
    refreshRideJournal
  } = usePlannerLibraries({ onWarning: showStorageWarning })

  const routes = plan?.routes ?? []
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null
  const activeSegmentProfiles = planMode === "destination"
    ? normalizedSegmentProfiles(segmentProfiles, via.length + 1, profile)
    : []

  useEffect(() => {
    void fetch("/api/gpx-library", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Project GPX library unavailable")
        return response.json() as Promise<ProjectGpxCatalog>
      })
      .then((catalog) => setProjectRoutes(catalog.routes))
      .catch(() => setProjectRoutes([]))
  }, [])

  useEffect(() => {
    if (!autoNightRef.current) return
    const check = () => {
      const coord = start ?? finish
      if (!coord) return
      if (isNightTime(new Date(), coord.lat, coord.lon)) {
        setMapStyle((prev) => (prev === "night" ? prev : "night"))
      }
    }
    check()
    const id = setInterval(check, 120_000)
    return () => clearInterval(id)
  }, [start, finish])

  useEffect(() => {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
    const hour = new Date().getHours()
    const afterDark = hour < 6 || hour >= 19
    const resolved = navigation.theme === "auto"
      ? (mapStyle === "night" || prefersDark || afterDark ? "dark" : "light")
      : navigation.theme
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themePreference = navigation.theme
    localStorage.setItem("switchback:theme", navigation.theme)
  }, [mapStyle, navigation.theme])

  useEffect(() => {
    const handleBack = () => dispatchNavigation({ type: "back" })
    window.addEventListener("popstate", handleBack)
    return () => window.removeEventListener("popstate", handleBack)
  }, [])

  useEffect(() => {
    // those environments load their current assets directly; caching them in a
    // service worker can pin a stale chunk and masquerade as a routing fault.
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The route pack remains usable from IndexedDB even if this browser has
      // disabled service workers or persistent tile caching.
    })
  }, [])

  const handleLocationSeed = useCallback((source: "saved" | "live") => {
    setIntentSummary(source === "live"
      ? "Using your current location as the route start. It is kept only in this browser."
      : "Using your last saved browser location while the current GPS fix loads.")
  }, [])
  usePlannerLocationSeed({
    gate: routeRequestGate,
    getPlanner: usePlannerStore.getState,
    onSeed: handleLocationSeed
  })

  useEffect(() => {
    const shared = restorePortableShare(window.location.href)
    if (!shared) return
    const editState = routeEditState(shared)
    const store = usePlannerStore.getState()
    store.replaceRoutePoints({ start: editState.start, finish: editState.finish, via: editState.via })
    store.setProfile(shared.profile)
    store.applyPlan({
      selectedRouteId: shared.id,
      routes: [shared],
      warnings: ["Private portable route copy loaded. It is editable and remains local until you save or share it."]
    })
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    const publishLoadedShare = window.setTimeout(() => {
      setPlanMode(editState.mode)
      setNotice({ kind: "success", message: "Private route copy loaded with its protected start/end geometry removed." })
    }, 0)
    return () => window.clearTimeout(publishLoadedShare)
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

  const runTripPlan = async (request: TripPlanRequest): Promise<TripPlan | null> => {
    return runLatestTripPlan({
      request,
      gate: routeRequestGate,
      getPlanner: usePlannerStore.getState,
      onWarning: (message) => setNotice({ kind: "warning", message })
    })
  }

  const handlePlan = async () => {
    const current = usePlannerStore.getState()
    try {
      loopSeed.current += 1
      const customSegmentProfiles = planMode === "destination" && activeSegmentProfiles.some((item) => item !== current.profile)
        ? activeSegmentProfiles
        : undefined
      await runTripPlan(buildRideTripRequest({
        mode: planMode,
        start: current.start,
        finish: current.finish,
        profile: current.profile,
        bikeProfile: current.bikeProfile,
        roadLocks: current.roadLocks,
        targetMinutes,
        seed: loopSeed.current,
        via: current.via,
        avoidHighways,
        avoidAreas,
        segmentProfiles: customSegmentProfiles,
        planningId: createPlanningId()
      }))
    } catch (caught) {
      current.failRouting({
        code: "MISSING_WAYPOINTS",
        message: caught instanceof Error ? caught.message : "Choose the points for this ride first."
      })
    }
  }

  const handleRidePrompt = usePlannerRideIntent({
    gate: routeRequestGate,
    home,
    targetMinutes,
    avoidAreas,
    segmentProfiles,
    nextSeed: () => ++loopSeed.current,
    runTripPlan,
    setPlanMode,
    setTargetMinutes,
    setAvoidHighways,
    setStopIdeas,
    setResearchSources,
    setIntentStatus,
    setIntentSummary,
    onNotice: setNotice
  })

  const handleChooseStopIdea = async (stop: Waypoint) => {
    const current = usePlannerStore.getState()
    const activeRoute = current.plan?.routes.find((route) => route.id === current.selectedRouteId) ?? current.plan?.routes[0]
    const routedVia = planMode === "loop" && activeRoute
      ? buildLoopStopVia(activeRoute.geometry, stop)
      : [stop]
    current.clearVia()
    routedVia.forEach((point) => current.addVia(point))
    setStopIdeas(null)
    try {
      loopSeed.current += 1
      await runTripPlan(buildRideTripRequest({
        mode: planMode,
        start: current.start,
        finish: current.finish,
        profile: current.profile,
        bikeProfile: current.bikeProfile,
        roadLocks: current.roadLocks,
        targetMinutes,
        seed: loopSeed.current,
        via: routedVia,
        avoidHighways,
        avoidAreas
      }))
      setIntentSummary(`${stop.label ?? "That stop"} is now a routed stop. Change the idea or choose another route whenever you like.`)
    } catch (caught) {
      current.failRouting({
        code: "STOP_ROUTE_FAILED",
        message: caught instanceof Error ? caught.message : "That stop could not be added to the route."
      })
    }
  }

  const { researchRideIdea: handleRideResearch, cancel: cancelRideResearch } = usePlannerRideResearch({
    setStatus: setResearchStatus,
    setSources: setResearchSources,
    setSummary: setIntentSummary,
    onNotice: setNotice
  })

  const applyAppTab = (tab: AppTab, historyMode: "push" | "replace" = "push") => {
    dispatchNavigation({ type: "select_tab", tab })
    usePlannerStore.getState().setSurface(tab === "library" ? "library" : "planner")
    const url = new URL(window.location.href)
    if (tab === "plan") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tab)
    window.history[historyMode === "push" ? "pushState" : "replaceState"](
      { switchbackTab: tab },
      "",
      `${url.pathname}${url.search}${url.hash}`
    )
  }

  const handleLoad = (route: PlannedRoute, trip: SavedTripPlan | null = null) => {
    routeRequestGate.invalidate()
    const editState = routeEditState(route)
    const store = usePlannerStore.getState()
    store.replaceRoutePoints({
      start: editState.start,
      finish: editState.finish,
      via: editState.via
    })
    store.setProfile(route.profile)
    setPlanMode(editState.mode)
    if (editState.targetMinutes) setTargetMinutes(editState.targetMinutes)
    setAvoidHighways(route.avoidHighways ?? false)
    setAvoidAreas(route.avoidAreas ?? [])
    setSegmentProfiles(route.segmentProfiles ?? [])
    setIntentSummary(null)
    setRestoredTrip(trip)
    store.applyPlan({
      selectedRouteId: route.id,
      routes: [route],
      warnings: []
    })
    applyAppTab("plan", "replace")
  }

  const {
    saveRoute: handleSave,
    exportRoute: handleExport,
    deleteRoute: handleDelete,
    loadProject: handleLoadProject,
    importRoute: handleImport
  } = createRouteExchangeActions({
    library: routeLibrary,
    refresh: refreshLibrary,
    onNotice: setNotice,
    onLoad: handleLoad
  })

  const { startRide: handleStartRide, matchImported: handleMatchImported } = usePlannerRideActions({
    runTripPlan,
    invalidateRequests: routeRequestGate.invalidate,
    setPlanMode,
    setAvoidAreas,
    setSegmentProfiles,
    setRideOriginalRoute,
    onNotice: setNotice
  })

  const handleLoadRecordedRide = (ride: RecordedRide) => {
    routeRequestGate.invalidate()
    const actual: PlannedRoute = {
      ...ride.route,
      id: `${ride.id}-actual`,
      name: `${ride.routeName} · actual ride`,
      geometry: ride.points.map((point) => point.coordinate),
      instructions: [],
      routingSource: "imported",
      previewOnly: false
    }
    usePlannerStore.getState().applyPlan({
      selectedRouteId: actual.id,
      routes: [ride.route, actual],
      warnings: ["Actual ride replay loaded beside the planned route. Imported replay geometry is not silently re-routed."]
    })
    applyAppTab("plan", "replace")
    setNotice({ kind: "success", message: `Replay loaded: ${ride.points.length} recorded points, notes, and photo metadata remain on this device.` })
  }

  const handleMapPick = async (point: Waypoint) => {
    if (addingVia) {
      routeRequestGate.invalidate()
      const picked = { ...point, label: point.label ?? `Shaping stop ${via.length + 1}` }
      const current = usePlannerStore.getState()
      let routeToShape: PlannedRoute | null = selectedRoute
      if (planMode === "loop" && !routeToShape) {
        loopSeed.current += 1
        const initialLoop = await runTripPlan(buildRideTripRequest({
          mode: "loop",
          start: current.start,
          finish: null,
          profile: current.profile,
          bikeProfile: current.bikeProfile,
          roadLocks: current.roadLocks,
          targetMinutes,
          seed: loopSeed.current,
          avoidHighways,
          avoidAreas
        }))
        routeToShape = initialLoop?.routes.find((route) => route.id === initialLoop.selectedRouteId) ?? initialLoop?.routes[0] ?? null
      }
      if (planMode === "loop" && routeToShape && current.via.length === 0) {
        current.clearVia()
        buildLoopStopVia(routeToShape.geometry, picked).forEach((waypoint) => current.addVia(waypoint))
      } else {
        current.addVia(picked)
      }
      setAddingVia(false)
      await handlePlan()
      return
    }
    const id = usePlannerStore.getState().armedPoint
    if (id) handlePointChange(id, point)
  }

  const handleRouteSketch = async (trace: Waypoint[]) => {
    routeRequestGate.invalidate()
    try {
      const current = usePlannerStore.getState()
      const points = routePointsFromSketch({
        mode: planMode,
        start: current.start,
        finish: current.finish,
        trace
      })
      current.replaceRoutePoints(points)
      setSegmentProfiles([])
      setAddingVia(false)
      await handlePlan()
      setNotice({
        kind: "success",
        message: `Rough line converted to ${points.via.length} editable shaping stop${points.via.length === 1 ? "" : "s"}.`
      })
    } catch (caught) {
      setNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "The rough route could not be read."
      })
    }
  }

  const handleWaypointDrag = (kind: "start" | "finish" | "via", index: number, point: Waypoint) => {
    routeRequestGate.invalidate()
    const current = usePlannerStore.getState()
    if (kind === "via") {
      current.updateVia(index, {
        ...point,
        label: current.via[index]?.label ?? `Shaping stop ${index + 1}`,
        locked: current.via[index]?.locked
      })
    } else {
      current.setPoint(kind, { ...point, label: current[kind]?.label ?? `Dragged ${kind}` })
    }
    void handlePlan()
  }

  const handleClearRoute = () => {
    routeRequestGate.invalidate()
    cancelRideResearch()
    usePlannerStore.getState().clearRoute()
    setPlanMode("destination")
    setTargetMinutes(120)
    setAvoidHighways(false)
    setAvoidAreas([])
    setSegmentProfiles([])
    setAddingVia(false)
    setStopIdeas(null)
    setIntentStatus("idle")
    setIntentSummary(null)
    setResearchStatus("idle")
    setResearchSources([])
    setRideOriginalRoute(null)
    navigationStore.clear()
    setNotice({ kind: "success", message: "Route cleared. Choose a new ride whenever you’re ready." })
  }

  const handleAppTab = (tab: AppTab) => {
    applyAppTab(tab)
  }

  return (
    <main className="planner-shell" id="top" data-sketching={sketching ? "true" : "false"}>
      <MapStage
        routes={routes}
        selectedRouteId={selectedRouteId}
        start={start}
        finish={finish}
        via={via}
        armedPoint={armedPoint}
        addingVia={addingVia}
        recalculating={isRecalculating}
        curvatureVisible={curvatureVisible}
        unpavedVisible={unpavedVisible}
        mapStyle={mapStyle}
        riderLayers={riderLayers}
        routeVisibility={routeVisibility}
        mapPacks={mapPacks}
        referenceMap={referenceMap}
        rideMode={surface === "ride"}
        onCurvatureChange={(visible) => {
          usePlannerStore.getState().setCurvatureVisible(visible)
          setRiderLayers((layers) => layers.map((layer) => layer.id === "curvature" ? { ...layer, visible } : layer))
        }}
        onUnpavedChange={(visible) => {
          setUnpavedVisible(visible)
          setRiderLayers((layers) => layers.map((layer) => layer.id === "unpaved" ? { ...layer, visible } : layer))
        }}
        onMapStyleChange={(style) => {
          autoNightRef.current = false
          setMapStyle(style)
        }}
        onRiderLayerChange={(id: RiderLayerId, patch) => {
          setRiderLayers((layers) => layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer))
          if (id === "curvature" && typeof patch.visible === "boolean") usePlannerStore.getState().setCurvatureVisible(patch.visible)
          if (id === "unpaved" && typeof patch.visible === "boolean") setUnpavedVisible(patch.visible)
        }}
        onMoveRiderLayer={(id, direction) => {
          setRiderLayers((layers) => {
            const sorted = [...layers].sort((first, second) => first.order - second.order)
            const index = sorted.findIndex((layer) => layer.id === id)
            const nextIndex = direction === "earlier" ? index - 1 : index + 1
            if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return layers
            const current = sorted[index]!
            sorted[index] = sorted[nextIndex]!
            sorted[nextIndex] = current
            return sorted.map((layer, order) => ({ ...layer, order }))
          })
        }}
        onRouteVisibilityChange={setRouteVisibility}
        onSaveMapPack={(name) => {
          void mapPackLibrary.save({ name, mapStyle, routeVisibility, layers: riderLayers })
            .then(async (pack) => {
              await refreshMapPacks()
              setNotice({ kind: "success", message: `${pack.name} map pack saved on this device.` })
            })
            .catch((caught) => setNotice({ kind: "warning", message: caught instanceof Error ? caught.message : "Map pack could not be saved." }))
        }}
        onApplyMapPack={(id) => {
          const pack = mapPacks.find((candidate) => candidate.id === id)
          if (!pack) return
          const applied = applyRiderMapPack(riderLayers, pack)
          setMapStyle(applied.mapStyle)
          setRouteVisibility(applied.routeVisibility)
          setRiderLayers(applied.layers)
          usePlannerStore.getState().setCurvatureVisible(applied.layers.find((layer) => layer.id === "curvature")?.visible ?? false)
          setUnpavedVisible(applied.layers.find((layer) => layer.id === "unpaved")?.visible ?? false)
          setNotice({ kind: "success", message: `${pack.name} map pack applied.` })
        }}
        onReferenceMapChange={setReferenceMap}
        onWaypointDrag={handleWaypointDrag}
        onMapPick={(point) => void handleMapPick(point)}
        onRouteSketch={(trace) => void handleRouteSketch(trace)}
        onSketchModeChange={setSketching}
        avoidAreas={avoidAreas}
        onAvoidArea={(area) => {
          routeRequestGate.invalidate()
          setAvoidAreas((areas) => [...areas, area].slice(0, 3))
          setNotice({ kind: "warning", message: `${area.name ?? "Avoid area"} will be excluded when you replan.` })
        }}
      />

      {surface !== "ride" ? (
        <AppNavigation activeTab={navigation.activeTab} onSelect={handleAppTab} />
      ) : null}

      {surface !== "ride" && navigation.activeTab === "plan" && !sketching ? (
        <PlannerDeck
          viewModel={buildPlannerDeckViewModel({
            start,
            finish,
            startQuery,
            finishQuery,
            armedPoint,
            profile,
            bikeProfile,
            roadLocks,
            status,
            error,
            curvatureVisible,
            avoidHighways,
            savedCount: savedRoutes.length + projectRoutes.length,
            via,
            addingVia,
            segmentProfiles: activeSegmentProfiles,
            avoidAreaCount: avoidAreas.length,
            canUndoRoutePoints,
            canRedoRoutePoints,
            planMode,
            targetMinutes,
            intentStatus,
            intentSummary,
            stopIdeas,
            researchStatus,
            researchSources,
            selectedRoute,
            home,
            planningPhase: usePlannerStore.getState().planningPhase,
            planningStartedAt: usePlannerStore.getState().planningStartedAt,
            isRecalculating: usePlannerStore.getState().isRecalculating
          })}
          commands={{
            waypoint: {
              onPointChange: handlePointChange,
              onPointQueryChange: (id, query) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().setPointQuery(id, query)
              },
              onArm: (id) => {
                setAddingVia(false)
                usePlannerStore.getState().armPoint(armedPoint === id ? null : id)
              },
              onSwap: () => {
                if (start && finish) {
                  routeRequestGate.invalidate()
                  usePlannerStore.getState().reverseRoutePoints("destination")
                  void handlePlan()
                }
              },
              onToggleAddVia: () => {
                usePlannerStore.getState().armPoint(null)
                setAddingVia((active) => !active)
              },
              onRemoveVia: (index) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().removeVia(index)
                void handlePlan()
              },
              onMoveVia: (fromIndex, toIndex) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().moveVia(fromIndex, toIndex)
                void handlePlan()
              },
              onReverseRoute: () => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().reverseRoutePoints(planMode)
                void handlePlan()
              },
              onUndoRoutePoints: () => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().undoRoutePoints()
                void handlePlan()
              },
              onRedoRoutePoints: () => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().redoRoutePoints()
                void handlePlan()
              },
              onToggleViaLock: (index) => {
                routeRequestGate.invalidate()
                const current = usePlannerStore.getState()
                const point = current.via[index]
                if (!point) return
                current.updateVia(index, { ...point, locked: !point.locked })
              }
            },
            rideConfig: {
              onProfileChange: (nextProfile) => {
                if (nextProfile === usePlannerStore.getState().profile) return
                routeRequestGate.invalidate()
                usePlannerStore.getState().setProfile(nextProfile)
              },
              onBikeProfileChange: (nextBikeProfile) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().setBikeProfile(nextBikeProfile)
              },
              onCurvatureChange: (visible) => {
                usePlannerStore.getState().setCurvatureVisible(visible)
                setRiderLayers((layers) => layers.map((layer) => layer.id === "curvature" ? { ...layer, visible } : layer))
              },
              onAvoidHighwaysChange: (avoid) => {
                routeRequestGate.invalidate()
                setAvoidHighways(avoid)
              },
              onPlanModeChange: (mode) => {
                routeRequestGate.invalidate()
                setPlanMode(mode)
                setIntentSummary(null)
              },
              onTargetMinutesChange: (minutes) => {
                routeRequestGate.invalidate()
                setTargetMinutes(minutes)
              },
              onSegmentProfileChange: (index, nextProfile) => {
                routeRequestGate.invalidate()
                setSegmentProfiles((profiles) => {
                  const next = normalizedSegmentProfiles(profiles, via.length + 1, profile)
                  next[index] = nextProfile
                  return next
                })
              },
              onRemoveAvoidArea: () => {
                routeRequestGate.invalidate()
                setAvoidAreas((areas) => areas.slice(0, -1))
              },
              onAddRoadLock: (lock) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().addRoadLock(lock)
              },
              onUpdateRoadLock: (id, patch) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().updateRoadLock(id, patch)
              },
              onRemoveRoadLock: (id) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().removeRoadLock(id)
              },
              onConvertRoadLock: (id) => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().convertRoadLock(id)
              },
              onClearRoadLocks: () => {
                routeRequestGate.invalidate()
                usePlannerStore.getState().clearRoadLocks()
              }
            },
            intent: {
              onRidePrompt: (prompt) => void handleRidePrompt(prompt),
              onChooseStopIdea: (stop) => void handleChooseStopIdea(stop),
              onResearchRideIdea: (prompt) => void handleRideResearch(prompt)
            },
            onClearRoute: handleClearRoute,
            onPlan: () => void handlePlan(),
            onCancelPlanning: () => {
              cancelRoutingRequest()
              usePlannerStore.getState().cancelPlanning()
            },
            onUseHome: useHome,
            onSaveHome: () => saveHome(start),
            onClearHome: clearHome,
            onOpenLibrary: () => handleAppTab("library"),
            onStartRide: (route) => void handleStartRide(route),
            onSaveOffline: (route, options) => {
              void buildOfflinePackCorridor(route, options ?? {}).then(() => {
                return offlinePackLibraryRef.current!.save({
                  route,
                  mapStyle,
                  routeVisibility,
                  activeLayerIds: riderLayers.filter((layer) => layer.visible).map((layer) => layer.id)
                })
              }).then(() => {
                setNotice({
                  kind: "success",
                  message: "Offline route pack saved: route, cues, and active map setup are ready for recovery."
                })
              }).catch((caught) => setNotice({
                kind: "warning",
                message: caught instanceof Error ? caught.message : "Offline route pack could not be saved."
              }))
            }
          }}
        >
          {routes.length > 0 && selectedRouteId ? (
            <RouteComparison
              routes={routes}
              selectedId={selectedRouteId}
              onSelect={(id) => usePlannerStore.getState().selectRoute(id)}
              onSave={(route) => void handleSave(route)}
              onExport={handleExport}
              onRide={(route) => void handleStartRide(route)}
              onRate={(route, motorcycleId, rating) => {
                return riderPreferenceLibraryRef.current!.record({
                  route,
                  motorcycleId,
                  rating,
                  source: "rating"
                }).then((preference) => {
                  setNotice({
                    kind: "success",
                    message: `Saved your ${rating}/5 rating for ${preference.motorcycleId} · ${preference.profile}.`
                  })
                  return preference
                }).catch((error) => {
                  setNotice({ kind: "warning", message: "Your route rating could not be saved on this device." })
                  throw error
                })
              }}
              onShareCreated={() => setNotice({
                kind: "success",
                message: "Private editable route link created. Selected privacy zones were removed before sharing."
              })}
              savedTrip={restoredTrip ?? undefined}
              onSaveTrip={(route, tripStages, constraints) => {
                const created = createTripPlan(route, tripStages, constraints)
                const trip = restoredTrip?.routeId === route.id
                  ? { ...created, id: restoredTrip.id, createdAt: restoredTrip.createdAt }
                  : created
                void tripPlanLibraryRef.current!.save(trip).then((savedTrip) => {
                  setRestoredTrip(savedTrip)
                  setNotice({ kind: "success", message: `${savedTrip.stages.length}-day trip saved on this device.` })
                  void tripPlanLibraryRef.current!.list().then(setSavedTrips)
                }).catch(() => setNotice({ kind: "warning", message: "This trip could not be saved on this device." }))
              }}
              showRideAction={false}
            />
          ) : null}
        </PlannerDeck>
      ) : null}
      {surface === "library" && navigation.activeTab === "library" ? (
        <LibraryDrawer
          routes={savedRoutes}
          recordedRides={recordedRides}
          trips={savedTrips}
          projectRoutes={projectRoutes}
          onClose={() => handleAppTab("plan")}
          onLoad={handleLoad}
          onLoadTrip={(trip) => handleLoad(trip.route, trip)}
          onDeleteTrip={(trip) => {
            void tripPlanLibraryRef.current!.remove(trip.id).then(async () => {
              if (restoredTrip?.id === trip.id) setRestoredTrip(null)
              setSavedTrips(await tripPlanLibraryRef.current!.list())
              setNotice({ kind: "success", message: `${trip.name} was removed from this device.` })
            }).catch(() => setNotice({ kind: "warning", message: "That saved trip could not be removed." }))
          }}
          onLoadRecorded={handleLoadRecordedRide}
          onMatchImported={(route) => void handleMatchImported(route)}
          onLoadProject={(route) => void handleLoadProject(route)}
          onDelete={(route) => void handleDelete(route)}
          onOrganize={(route, organization) => {
            void routeLibrary.organize(route.id, organization)
              .then(async () => {
                await refreshLibrary()
                setNotice({ kind: "success", message: `${route.name} organization updated on this device.` })
              })
              .catch((caught) => setNotice({
                kind: "warning",
                message: caught instanceof Error ? caught.message : "Route organization could not be updated."
              }))
          }}
          onImport={(file) => void handleImport(file)}
        />
      ) : null}
      {surface !== "ride" && navigation.activeTab === "record" ? (
        <RecordPanel
          onFinish={(points) => {
            if (points.length < 2) {
              setNotice({ kind: "warning", message: "Record at least two GPS points before finishing." })
              return
            }
            const first = points[0]!.coordinate
            const last = points.at(-1)!.coordinate
            const durationMinutes = Math.max(0, (Date.parse(points.at(-1)!.recordedAt) - Date.parse(points[0]!.recordedAt)) / 60_000)
            const recordedRoute: PlannedRoute = selectedRoute ?? {
              id: `recording-${Date.now()}`,
              name: `Recorded ride · ${new Date().toLocaleDateString()}`,
              profile: "quick",
              geometry: points.map((point) => point.coordinate),
              waypoints: [
                { lat: first[1], lon: first[0], label: "Recording start" },
                { lat: last[1], lon: last[0], label: "Recording finish" }
              ],
              instructions: [],
              distanceMiles: recordedDistanceMiles(points),
              durationMinutes,
              ascentMeters: null,
              descentMeters: null,
              twistiness: 0,
              turnCount: 0,
              roadMix: {},
              surfaceMix: {},
              routingSource: "imported",
              previewOnly: false
            }
            void rideJournalLibrary.save({ route: recordedRoute, points }).then(async (saved) => {
              await refreshRideJournal()
              setNotice({ kind: "success", message: `${saved.routeName} saved to Library rides.` })
            }).catch((caught) => setNotice({
              kind: "warning",
              message: caught instanceof Error ? caught.message : "Recorded ride could not be saved."
            }))
          }}
        />
      ) : null}
      {surface !== "ride" && navigation.activeTab === "profile" ? (
        <ProfilePanel
          theme={navigation.theme}
          onThemeChange={(theme) => dispatchNavigation({ type: "set_theme", theme })}
          onOpenDownloads={() => dispatchNavigation({ type: "open_overlay", overlay: "downloads" })}
        />
      ) : null}
      {surface !== "ride" && navigation.overlays.includes("downloads") ? (
        <div className="app-overlay-scrim" role="dialog" aria-modal="true" aria-labelledby="downloads-overlay-title">
          <section className="app-overlay-panel">
            <header><h2 id="downloads-overlay-title">Region downloads</h2><button type="button" aria-label="Close region downloads" onClick={() => dispatchNavigation({ type: "close_overlay", overlay: "downloads" })}>×</button></header>
            <RegionDownloadsPanel
              activeWaypoints={[start, ...via, finish].filter((point): point is Waypoint => point != null).map((point) => [point.lon, point.lat])}
              pendingRoute={selectedRoute ? { id: selectedRoute.id, waypoints: selectedRoute.waypoints } : null}
            />
          </section>
        </div>
      ) : null}
      {surface === "ride" && selectedRoute ? (
        <RideHud
          key={selectedRoute.id}
          route={selectedRoute}
          onExit={() => {
            navigationStore.clear()
            setRideOriginalRoute(null)
            usePlannerStore.getState().setSurface("planner")
          }}
          onReroute={(rerouted) => {
            // A detour is a new navigable line, never an overwrite of the
            // rider's authored plan. Both lines remain selectable when they
            // return to the planner.
            usePlannerStore.getState().applyPlan({
              selectedRouteId: rerouted.id,
              routes: [rideOriginalRoute ?? selectedRoute, rerouted],
              warnings: ["Recovery line added. Your original planned route is preserved beside it."]
            })
          }}
          onRideRecorded={(recorded) => {
            void rideJournalLibrary.save(recorded).then((saved) => {
              void refreshRideJournal()
              setNotice({ kind: "success", message: `Ride replay saved locally with ${saved.points.length} GPS points.` })
            }).catch((caught) => setNotice({
              kind: "warning",
              message: caught instanceof Error ? caught.message : "Ride replay could not be saved."
            }))
          }}
        />
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
