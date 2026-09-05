from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"patch anchor not found in {path}:\n{old[:220]}")
    p.write_text(text.replace(old, new, 1))


stage = "src/components/planner/PlannerMapStage.tsx"

replace(
    stage,
    'import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactElement, useSyncExternalStore } from "react"',
    'import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactElement, useSyncExternalStore } from "react"'
)
replace(
    stage,
    'import "@/app/styles/map-stage-road-locks.css"',
    'import "@/app/styles/map-stage-road-locks.css"\nimport "@/app/styles/route-sculpting.css"'
)
replace(
    stage,
    '  roadLockLineLayerIds,\n  ROUTE_HIT_LAYER,\n  routeRibbonLayers',
    '  roadLockLineLayerIds,\n  ROUTE_HIT_LAYER,\n  SELECTED_ROUTE_HIT_LAYER,\n  routeRibbonLayers'
)
replace(
    stage,
    'import { useRoadLockDraft } from "./useRoadLockDraft"',
    'import { useRoadLockDraft } from "./useRoadLockDraft"\nimport {\n  reduceRouteSculptState,\n  type RouteSculptAction,\n  type RouteSculptState,\n  type SculptPoint\n} from "./route-sculpting-state"'
)
replace(
    stage,
    '''  const routePreviewId = useSyncExternalStore(
    subscribeRoutePreview,
    getRoutePreviewId,
    () => null
  )
  const sketchPointsRef = useRef<SketchScreenPoint[]>([])''',
    '''  const routePreviewId = useSyncExternalStore(
    subscribeRoutePreview,
    getRoutePreviewId,
    () => null
  )
  const sculptStateRef = useRef<RouteSculptState>({ kind: "idle" })
  const sculptPointerIdRef = useRef<number | null>(null)
  const [sculptState, setSculptState] = useState<RouteSculptState>({ kind: "idle" })
  const applyRouteSculptAction = useCallback((action: RouteSculptAction): RouteSculptState => {
    const next = reduceRouteSculptState(sculptStateRef.current, action)
    sculptStateRef.current = next
    setSculptState(next)
    return next
  }, [])
  const cancelRouteSculpt = useCallback(() => {
    const pointerId = sculptPointerIdRef.current
    sculptPointerIdRef.current = null
    const map = mapRef.current
    const canvas = map?.getCanvas()
    if (pointerId !== null && canvas?.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId)
    map?.dragPan.enable()
    applyRouteSculptAction({ type: "cancel" })
  }, [applyRouteSculptAction])
  const sketchPointsRef = useRef<SketchScreenPoint[]>([])'''
)
replace(
    stage,
    '''    beginLockDraft,
    isLockDrawActive,''',
    '''    beginLockDraft,
    beginLockDraftFromAnchors,
    isLockDrawActive,'''
)
replace(
    stage,
    '''  } = useRoadLockDraft({ addRoadLock })''',
    '''  } = useRoadLockDraft({
    addRoadLock,
    onCommitted: () => propsRef.current.onRouteSculptCommit?.()
  })'''
)
replace(
    stage,
    '''  useEffect(() => {
    propsRef.current = props
  }, [props])

  useEffect(() => {
    let disposed = false''',
    '''  useEffect(() => {
    propsRef.current = props
  }, [props])

  useEffect(() => {
    const current = sculptStateRef.current
    if (current.kind === "idle") return
    if (
      props.rideMode
      || !props.selectedRouteId
      || ("routeId" in current && current.routeId !== props.selectedRouteId)
      || props.armedPoint
      || props.addingVia
      || lockDrawMode
      || sketchMode
      || avoidMode
    ) cancelRouteSculpt()
  }, [props.rideMode, props.selectedRouteId, props.armedPoint, props.addingVia, lockDrawMode, sketchMode, avoidMode, cancelRouteSculpt])

  useEffect(() => {
    if (sculptState.kind === "idle") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRouteSculpt()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [sculptState.kind, cancelRouteSculpt])

  useEffect(() => {
    let disposed = false'''
)
replace(
    stage,
    '''    let releaseMapProbe: (() => void) | null = null
    let initialStyleLoaded = false''',
    '''    let releaseMapProbe: (() => void) | null = null
    let releaseSculptListeners: (() => void) | null = null
    let initialStyleLoaded = false'''
)
replace(
    stage,
    '''      let draggedWaypoint: { kind: "start" | "finish" | "via"; index: number } | null = null
      let suppressNextClick = false

      map.on("click", (event) => {''',
    '''      let draggedWaypoint: { kind: "start" | "finish" | "via"; index: number } | null = null
      let suppressNextClick = false

      const canvas = map.getCanvas()
      const sculptPointFromPointer = (event: PointerEvent): SculptPoint => {
        const bounds = canvas.getBoundingClientRect()
        const screen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
        const lngLat = map!.unproject([screen.x, screen.y])
        return {
          screen,
          coordinate: [Number(lngLat.lng.toFixed(6)), Number(lngLat.lat.toFixed(6))]
        }
      }
      const selectedRouteAt = (point: SculptPoint): string | null => {
        if (!map?.getLayer(SELECTED_ROUTE_HIT_LAYER)) return null
        const feature = map.queryRenderedFeatures([point.screen.x, point.screen.y], {
          layers: [SELECTED_ROUTE_HIT_LAYER]
        })[0]
        const routeId = feature?.properties?.routeId
        return typeof routeId === "string" ? routeId : null
      }
      const canSculptSelectedRoute = (routeId: string | null): routeId is string => {
        const current = propsRef.current
        return Boolean(
          routeId
          && routeId === current.selectedRouteId
          && current.routes.some((route) => route.id === routeId)
          && !current.rideMode
          && !current.armedPoint
          && !current.addingVia
          && !isLockDrawActive()
          && !sketchDrawingRef.current
          && !avoidDrawingRef.current
        )
      }
      const onSculptPointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return
        const point = sculptPointFromPointer(event)
        const routeId = selectedRouteAt(point)
        if (!canSculptSelectedRoute(routeId)) return
        event.preventDefault()
        sculptPointerIdRef.current = event.pointerId
        canvas.setPointerCapture?.(event.pointerId)
        map!.dragPan.disable()
        applyRouteSculptAction({ type: "press", routeId, point })
      }
      const onSculptPointerMove = (event: PointerEvent) => {
        if (sculptPointerIdRef.current !== event.pointerId) return
        event.preventDefault()
        applyRouteSculptAction({ type: "move", point: sculptPointFromPointer(event) })
      }
      const finishSculptPointer = (event: PointerEvent, cancelled: boolean) => {
        if (sculptPointerIdRef.current !== event.pointerId) return
        event.preventDefault()
        suppressNextClick = true
        const point = sculptPointFromPointer(event)
        sculptPointerIdRef.current = null
        if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        map!.dragPan.enable()
        if (cancelled) {
          applyRouteSculptAction({ type: "cancel" })
          return
        }
        const next = applyRouteSculptAction({ type: "release", point })
        if (next.kind === "proposed") {
          beginLockDraftFromAnchors([next.start.coordinate, next.end.coordinate], "prefer")
          applyRouteSculptAction({ type: "cancel" })
        }
      }
      const onSculptPointerUp = (event: PointerEvent) => finishSculptPointer(event, false)
      const onSculptPointerCancel = (event: PointerEvent) => finishSculptPointer(event, true)
      const onSculptContextMenu = (event: MouseEvent) => {
        const point = sculptPointFromPointer(event as unknown as PointerEvent)
        const routeId = selectedRouteAt(point)
        if (!canSculptSelectedRoute(routeId)) return
        event.preventDefault()
        cancelRouteSculpt()
        applyRouteSculptAction({ type: "open-menu", routeId, point })
      }
      canvas.addEventListener("pointerdown", onSculptPointerDown)
      canvas.addEventListener("pointermove", onSculptPointerMove)
      canvas.addEventListener("pointerup", onSculptPointerUp)
      canvas.addEventListener("pointercancel", onSculptPointerCancel)
      canvas.addEventListener("contextmenu", onSculptContextMenu)
      releaseSculptListeners = () => {
        canvas.removeEventListener("pointerdown", onSculptPointerDown)
        canvas.removeEventListener("pointermove", onSculptPointerMove)
        canvas.removeEventListener("pointerup", onSculptPointerUp)
        canvas.removeEventListener("pointercancel", onSculptPointerCancel)
        canvas.removeEventListener("contextmenu", onSculptContextMenu)
      }

      map.on("click", (event) => {'''
)
replace(
    stage,
    '''      releaseMapProbe?.()
      setReadyStyleKey(null)''',
    '''      releaseSculptListeners?.()
      releaseMapProbe?.()
      setReadyStyleKey(null)'''
)
replace(
    stage,
    '''      {props.armedPoint || props.addingVia ? (
        <div className="map-crosshair" aria-hidden="true">''',
    '''      {sculptState.kind === "shaping" ? (
        <svg className="map-route-sculpt-preview" aria-hidden="true">
          <line
            x1={sculptState.start.screen.x}
            y1={sculptState.start.screen.y}
            x2={sculptState.current.screen.x}
            y2={sculptState.current.screen.y}
          />
        </svg>
      ) : null}
      {sculptState.kind === "menu" && !props.rideMode ? (
        <div
          className="map-route-sculpt-menu"
          role="dialog"
          aria-label="Shape selected route"
          style={{
            left: `clamp(148px, ${sculptState.anchor.screen.x}px, calc(100% - 148px))`,
            top: `${Math.max(72, sculptState.anchor.screen.y)}px`
          }}
        >
          <strong>Shape this road</strong>
          {featureFlags.roadRequirements ? (
            <button
              type="button"
              data-mode="must"
              onClick={() => {
                beginLockDraftFromAnchors([sculptState.anchor.coordinate], "must")
                applyRouteSculptAction({ type: "cancel" })
              }}
            >Must use</button>
          ) : null}
          <button
            type="button"
            data-mode="prefer"
            onClick={() => {
              beginLockDraftFromAnchors([sculptState.anchor.coordinate], "prefer")
              applyRouteSculptAction({ type: "cancel" })
            }}
          >Prefer</button>
          <button
            type="button"
            data-mode="avoid"
            onClick={() => {
              applyRouteSculptAction({ type: "cancel" })
              resetLockDraft()
              if (sketchMode) cancelSketch()
              setAvoidMode(true)
              propsRef.current.onSketchModeChange(true)
            }}
          >Avoid nearby</button>
        </div>
      ) : null}
      {props.armedPoint || props.addingVia ? (
        <div className="map-crosshair" aria-hidden="true">'''
)

shell = "src/components/planner/PlannerShell.tsx"
replace(
    shell,
    '''        onAvoidArea={(area) => {
          routeRequestGate.invalidate()
          setAvoidAreas((areas) => [...areas, area].slice(0, 3))
          setNotice({ kind: "warning", message: `${area.name ?? "Avoid area"} will be excluded when you replan.` })
        }}
          />''',
    '''        onAvoidArea={(area) => {
          routeRequestGate.invalidate()
          setAvoidAreas((areas) => [...areas, area].slice(0, 3))
          setNotice({ kind: "warning", message: `${area.name ?? "Avoid area"} will be excluded when you replan.` })
        }}
        onRouteSculptCommit={() => handlePlan()}
          />'''
)
