from pathlib import Path

p = Path("src/components/planner/PlannerMapStage.tsx")
s = p.read_text()


def once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    s = s.replace(old, new, 1)


once(
    '} from "./ride-map-control-slot"\n',
    '} from "./ride-map-control-slot"\nimport {\n  getRoutePreviewId,\n  setRoutePreviewId,\n  subscribeRoutePreview\n} from "./route-comparison-preview"\n',
    "preview import",
)
once(
    '  roadLockLineLayerIds,\n  routeRibbonLayers\n} from "./planner-map-layers"',
    '  roadLockLineLayerIds,\n  ROUTE_HIT_LAYER,\n  routeRibbonLayers\n} from "./planner-map-layers"',
    "route hit import",
)
once(
    '  const sketchPointsRef = useRef<SketchScreenPoint[]>([])',
    '  const routePreviewId = useSyncExternalStore(\n    subscribeRoutePreview,\n    getRoutePreviewId,\n    () => null\n  )\n  const sketchPointsRef = useRef<SketchScreenPoint[]>([])',
    "preview subscription",
)
once(
    '  const addRoadLock = usePlannerStore((state) => state.addRoadLock)\n  const sheetDetentOverride = usePlannerStore((state) => state.sheetDetentOverride)',
    '  const addRoadLock = usePlannerStore((state) => state.addRoadLock)\n  const selectRoute = usePlannerStore((state) => state.selectRoute)\n  const sheetDetentOverride = usePlannerStore((state) => state.sheetDetentOverride)',
    "selection command",
)
once(
    '        for (const layer of routeRibbonLayers(renderer, experienceRef.current)) {\n          renderer.addLayer(map, layer, { slot: "top" })\n        }\n        map.addSource("switchback-route-labels", {',
    '''        for (const layer of routeRibbonLayers(renderer, experienceRef.current)) {
          renderer.addLayer(map, layer, { slot: "top" })
        }
        map.on("mouseenter", ROUTE_HIT_LAYER, () => {
          const current = propsRef.current
          if (current.rideMode || current.armedPoint || current.addingVia || isLockDrawActive()) return
          map!.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", ROUTE_HIT_LAYER, () => {
          map!.getCanvas().style.cursor = ""
        })
        map.on("click", ROUTE_HIT_LAYER, (event) => {
          const current = propsRef.current
          if (
            current.rideMode
            || current.armedPoint
            || current.addingVia
            || isLockDrawActive()
            || sketchDrawingRef.current
            || avoidDrawingRef.current
          ) return
          const routeId = event.features?.[0]?.properties?.routeId
          if (typeof routeId !== "string") return
          if (!current.routes.some((route) => route.id === routeId)) return
          setRoutePreviewId(null)
          selectRoute(routeId)
        })
        map.addSource("switchback-route-labels", {''',
    "map route interactions",
)
once(
    '        updatePlannerSources(map, propsRef.current)',
    '        updatePlannerSources(map, { ...propsRef.current, previewRouteId: getRoutePreviewId() })',
    "initial source update",
)
once(
    '''  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const current = propsRef.current
    updatePlannerSources(map, current)
    fitSelectedRoute(map, { ...current, sheetDetent: sheetDetentOverride ?? undefined })
    // Re-fit when the sheet detent changes: the visible map region grows or
    // shrinks with the ContextSheet, and the route must fit what is visible.
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.via, props.avoidAreas, props.rideMode, ready, sheetDetentOverride])''',
    '''  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const current = propsRef.current
    updatePlannerSources(map, { ...current, previewRouteId: routePreviewId })
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.via, props.avoidAreas, props.rideMode, ready, routePreviewId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const current = propsRef.current
    fitSelectedRoute(map, { ...current, sheetDetent: sheetDetentOverride ?? undefined })
    // Preview never moves the camera. Re-fit only when committed route/map
    // context or the visible sheet region changes.
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.via, props.avoidAreas, props.rideMode, ready, sheetDetentOverride])''',
    "split source/camera effects",
)

p.write_text(s)
