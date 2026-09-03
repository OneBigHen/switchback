"use client"

import {
  CaretDown,
  CaretUp,
  DownloadSimple,
  LockSimple,
  MapTrifold,
  NavigationArrow,
  Path,
  RoadHorizon,
  SpinnerGap,
  WarningCircle,
  X
} from "@phosphor-icons/react"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react"
import { listProfiles } from "@/lib/routing/profiles"
import { usePlannerStore } from "@/stores/planner-store"
import { DownloadModePicker, DOWNLOAD_MODE_PICKER_DEFAULT, type DownloadModePickerValue } from "./DownloadModePicker"
import { KeyboardScope } from "./a11y"
import { ContextSheet } from "./workspace/ContextSheet"
import { RoadLockLibraryDrawer } from "./RoadLockLibraryDrawer"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { isActivePlanningPhase } from "./PlannerDeckViewModel"
import { PlanComposer } from "./v2/PlanComposer"

export type { PlanMode, RideIntentStatus } from "./PlannerDeckViewModel"

interface VoiceRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface VoiceRecognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: ((event: unknown) => void) | null
  start(): void
}

type VoiceRecognitionConstructor = new () => VoiceRecognition

function isPhoneViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches
}

interface PlannerDeckProps {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  children?: ReactNode
}

export function PlannerDeck({ viewModel, commands, children }: PlannerDeckProps) {
  const { waypoint, rideConfig, intent, ui, lifecycle, providerHealth } = viewModel

  const start = waypoint.start
  const finish = waypoint.finish
  const startQuery = waypoint.startQuery
  const finishQuery = waypoint.finishQuery
  const armedPoint = waypoint.armedPoint
  const via = waypoint.via
  const addingVia = waypoint.addingVia
  const canUndoRoutePoints = waypoint.canUndoRoutePoints
  const canRedoRoutePoints = waypoint.canRedoRoutePoints

  const profile = rideConfig.profile
  const status = ui.status
  const error = ui.error
  const curvatureVisible = rideConfig.curvatureVisible
  const avoidHighways = rideConfig.avoidHighways
  const savedCount = ui.savedCount
  const segmentProfiles = rideConfig.segmentProfiles
  const avoidAreaCount = rideConfig.avoidAreaCount
  const planMode = rideConfig.planMode
  const targetMinutes = rideConfig.targetMinutes
  const timeShaped = rideConfig.timeShaped
  const intentStatus = intent.intentStatus
  const stopIdeas = intent.stopIdeas
  const researchStatus = intent.researchStatus
  const researchSources = intent.researchSources
  const selectedRoute = ui.selectedRoute ?? null
  const home = ui.home ?? null
  const planningActive = isActivePlanningPhase(lifecycle.phase)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!planningActive) return
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [planningActive])
  const elapsedSeconds = lifecycle.startedAt !== null && planningActive
    ? Math.max(0, Math.floor((now - lifecycle.startedAt) / 1000))
    : 0

  const { waypoint: wc, rideConfig: rc, intent: ic } = commands
  const onCancelPlanning = commands.onCancelPlanning
  const onRetryProviderHealth = commands.onRetryProviderHealth

  const onPointChange = wc.onPointChange
  const onPointQueryChange = wc.onPointQueryChange
  const onArm = wc.onArm
  const onSwap = wc.onSwap
  const onToggleAddVia = wc.onToggleAddVia
  const onRemoveVia = wc.onRemoveVia
  const onMoveVia = wc.onMoveVia
  const onReverseRoute = wc.onReverseRoute
  const onUndoRoutePoints = wc.onUndoRoutePoints
  const onRedoRoutePoints = wc.onRedoRoutePoints
  const onToggleViaLock = wc.onToggleViaLock

  const onProfileChange = rc.onProfileChange
  const onBikeProfileChange = rc.onBikeProfileChange
  const onCurvatureChange = rc.onCurvatureChange
  const onAvoidHighwaysChange = rc.onAvoidHighwaysChange
  const onPlanModeChange = rc.onPlanModeChange
  const onTargetMinutesChange = rc.onTargetMinutesChange
  const onTimeShapedChange = rc.onTimeShapedChange
  const onSegmentProfileChange = rc.onSegmentProfileChange
  const onRemoveAvoidArea = rc.onRemoveAvoidArea

  const onRidePrompt = ic.onRidePrompt
  const onChooseStopIdea = ic.onChooseStopIdea
  const onResearchRideIdea = ic.onResearchRideIdea
  const onUseCurrentLocation = commands.onUseCurrentLocation
  const onClearRoute = commands.onClearRoute
  const onPlan = commands.onPlan
  const onOpenLibrary = commands.onOpenLibrary
  const onUseHome = commands.onUseHome
  const onSaveHome = commands.onSaveHome
  const onClearHome = commands.onClearHome
  const onStartRide = commands.onStartRide
  const onStartFreeRide = commands.onStartFreeRide
  const onStartDrawing = commands.onStartDrawing
  const onSaveOffline = commands.onSaveOffline

  const [ridePrompt, setRidePrompt] = useState("")
  const sheetDetentOverride = usePlannerStore((state) => state.sheetDetentOverride)
  const setSheetDetentOverride = usePlannerStore((state) => state.setSheetDetentOverride)
  const sheetDetent = sheetDetentOverride ?? "half"
  const minimized = sheetDetent === "peek"
  const [editing, setEditing] = useState(false)
  const isIdlePlan = !selectedRoute && !editing && ui.routesCount === 0
  const [roadLocksOpen, setRoadLocksOpen] = useState(false)
  const [offlinePackOpen, setOfflinePackOpen] = useState(false)
  const [downloadMode, setDownloadMode] = useState<DownloadModePickerValue>(DOWNLOAD_MODE_PICKER_DEFAULT)
  const previousReadyStateRef = useRef({ phase: lifecycle.phase, routesCount: ui.routesCount })

  const planningStage: "Search" | "Choose" | "Edit" | "Prepare" = editing
    ? "Edit"
    : selectedRoute ? "Prepare"
    : (lifecycle.phase === "ready" || lifecycle.phase === "alternatives") && ui.routesCount > 1 ? "Choose"
    : "Search"

  const durationLabel = targetMinutes % 60 === 0
    ? `${targetMinutes / 60}-hour`
    : `${targetMinutes}-minute`
  const mustLockCount = rideConfig.roadLocks.filter((lock) => lock.mode === "must").length
  const bikeProfileMismatch = Boolean(selectedRoute) && (() => {
    const bikeCategory = rideConfig.bikeProfile.category
    const routeProfile = selectedRoute!.profile
    if (bikeCategory === "street" || bikeCategory === "touring") return routeProfile === "adventure"
    if (bikeCategory === "adventure") return false
    return routeProfile !== "adventure"
  })()

  useEffect(() => {
    const previous = previousReadyStateRef.current
    const routeReady = (lifecycle.phase === "ready" || lifecycle.phase === "alternatives")
      && ui.routesCount > 0
      && (previous.phase !== "ready" || previous.routesCount !== ui.routesCount)
    previousReadyStateRef.current = { phase: lifecycle.phase, routesCount: ui.routesCount }
    if (!routeReady) return

    setEditing(false)
    if (isPhoneViewport()) setSheetDetentOverride("half")
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".route-rack")?.scrollIntoView?.({ block: "start", behavior: "auto" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [lifecycle.phase, setSheetDetentOverride, ui.routesCount])

  const submitRidePrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = (new FormData(event.currentTarget).get("ride-prompt") as string | null ?? ridePrompt).trim()
    if (prompt.length < 3 || intentStatus === "interpreting") return
    onRidePrompt(prompt)
  }

  const planDisabled = !start
    || (planMode === "destination" && !finish)
    || status === "routing"
    || intentStatus === "interpreting"
  const planLabel = status === "routing"
    ? "Reading the roads…"
    : planMode === "loop"
      ? `Plan a ${durationLabel} loop`
      : "Plan route"

  const voiceSessionRef = useRef(false)
  const startVoiceInput = () => {
    if (voiceSessionRef.current) return
    const voiceWindow = window as typeof window & {
      SpeechRecognition?: VoiceRecognitionConstructor
      webkitSpeechRecognition?: VoiceRecognitionConstructor
    }
    const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition
    if (!SpeechRecognition) {
      document.getElementById("ride-prompt")?.focus()
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = "en-US"
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => setRidePrompt(event.results[0]?.[0]?.transcript ?? "")
    recognition.onerror = () => {
      // The typed input remains the fallback if speech permission or capture fails.
    }
    recognition.onend = () => {
      voiceSessionRef.current = false
    }
    try {
      voiceSessionRef.current = true
      recognition.start()
    } catch {
      voiceSessionRef.current = false
    }
  }

  return (
    <ContextSheet
      id="planner-sheet"
      className={`planner-deck sb-bottom-sheet${isIdlePlan ? " is-idle-plan" : ""}${minimized ? " is-minimized" : ""}${selectedRoute && onStartRide && onSaveOffline ? " has-expanded-route-dock" : ""}`}
      detent={sheetDetent}
      onDetentChange={setSheetDetentOverride}
      label="Motorcycle route planner"
    >
      {minimized ? (
        <>
          <div className="planner-mini-header">
            <button
              type="button"
              className="planner-expand"
              aria-label="Expand planner"
              aria-controls="planner-sheet"
              aria-expanded={false}
              onClick={() => setSheetDetentOverride(selectedRoute ? "full" : "half")}
            >
              <span className="brand-mark" aria-hidden="true"><Path weight="bold" /></span>
              <span>
                <small>{selectedRoute ? "Route ready" : "Route planner"}</small>
                <strong>{selectedRoute?.name ?? "Switchback"}</strong>
                <span className="planner-stage-chip" aria-label={`Planning stage: ${planningStage}`}>
                  {planningStage}
                </span>
              </span>
              <CaretUp aria-hidden="true" />
            </button>
          </div>
          {!selectedRoute && onStartFreeRide ? (
            <div className="planner-peek-actions" aria-label="Quick ride actions">
              <button type="button" className="planner-peek-action is-primary" onClick={onStartFreeRide}>
                <RoadHorizon weight="fill" aria-hidden="true" /> Free Ride
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="planner-scroll plan-v2-scroll">
            {planningStage !== "Search" || sheetDetent === "full" ? (
              <header className="deck-header ride-deck-header plan-v2-header">
                <div className="deck-header-tools">
                  {planningStage !== "Search" ? (
                    <span className="planner-stage-chip" aria-label={`Planning stage: ${planningStage}`}>
                      {planningStage}
                    </span>
                  ) : null}
                  {sheetDetent === "full" ? (
                    <button
                      type="button"
                      className="planner-full-map-tools"
                      aria-label="Show map tools"
                      title="Collapse planner to use map tools"
                      onClick={() => setSheetDetentOverride("half")}
                    >
                      <MapTrifold weight="bold" aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="planner-minimize"
                    aria-label="Minimize planner"
                    aria-controls="planner-sheet"
                    aria-expanded={true}
                    onClick={() => {
                      if (selectedRoute) setEditing(false)
                      setSheetDetentOverride("peek")
                    }}
                  >
                    <CaretDown aria-hidden="true" />
                  </button>
                </div>
              </header>
            ) : null}

            <PlanComposer
              planMode={planMode}
              onPlanModeChange={onPlanModeChange}
              onDraw={() => onStartDrawing?.()}
              ridePrompt={ridePrompt}
              onRidePromptChange={setRidePrompt}
              onRidePromptSubmit={submitRidePrompt}
              onStartVoiceInput={startVoiceInput}
              onUseCurrentLocation={onUseCurrentLocation}
              onMinimize={planningStage === "Search" && sheetDetent !== "full" ? () => setSheetDetentOverride("peek") : undefined}
              start={start}
              finish={finish}
              startQuery={startQuery}
              finishQuery={finishQuery}
              armedPoint={armedPoint}
              via={via}
              addingVia={addingVia}
              canUndoRoutePoints={canUndoRoutePoints}
              canRedoRoutePoints={canRedoRoutePoints}
              profile={profile}
              bikeProfile={rideConfig.bikeProfile}
              curvatureVisible={curvatureVisible}
              avoidHighways={avoidHighways}
              targetMinutes={targetMinutes}
              timeShaped={timeShaped}
              segmentProfiles={segmentProfiles}
              avoidAreaCount={avoidAreaCount}
              roadLockCount={rideConfig.roadLocks.length}
              savedCount={savedCount}
              home={home}
              providerHealth={providerHealth}
              onRetryProviderHealth={onRetryProviderHealth}
              intentStatus={intentStatus}
              planningPhase={lifecycle.phase}
              lifecycleLabel={lifecycle.label}
              elapsedSeconds={elapsedSeconds}
              error={error}
              editing={editing}
              onEditingChange={setEditing}
              onCancelPlanning={onCancelPlanning}
              onPointChange={onPointChange}
              onPointQueryChange={onPointQueryChange}
              onArm={onArm}
              onSwap={onSwap}
              onToggleAddVia={onToggleAddVia}
              onRemoveVia={onRemoveVia}
              onMoveVia={onMoveVia}
              onReverseRoute={onReverseRoute}
              onUndoRoutePoints={onUndoRoutePoints}
              onRedoRoutePoints={onRedoRoutePoints}
              onToggleViaLock={onToggleViaLock}
              onProfileChange={onProfileChange}
              onBikeProfileChange={onBikeProfileChange}
              onCurvatureChange={onCurvatureChange}
              onAvoidHighwaysChange={onAvoidHighwaysChange}
              onTargetMinutesChange={onTargetMinutesChange}
              onTimeShapedChange={onTimeShapedChange}
              onSegmentProfileChange={onSegmentProfileChange}
              onOpenRoadLocks={() => setRoadLocksOpen(true)}
              onRemoveAvoidArea={onRemoveAvoidArea}
              onOpenLibrary={onOpenLibrary}
              onUseHome={onUseHome}
              onSaveHome={onSaveHome}
              onClearHome={onClearHome}
              onStartFreeRide={onStartFreeRide}
              stopIdeas={stopIdeas}
              onChooseStopIdea={onChooseStopIdea}
              researchStatus={researchStatus}
              researchSources={researchSources}
              onResearchRideIdea={onResearchRideIdea}
            />
            {children}
          </div>

          {sheetDetent === "full" ? (
            <p className="planner-full-attribution" aria-label="Map data attribution">
              Map data: <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
            </p>
          ) : null}
        </>
      )}

      <div className="planner-action-dock" aria-label="Route actions">
        {!minimized && selectedRoute ? (
          <button
            type="button"
            className={`road-locks-dock-button${mustLockCount > 0 ? " has-must-locks" : ""}`}
            aria-label={`Open road locks${mustLockCount > 0 ? `, ${mustLockCount} must-use ${mustLockCount === 1 ? "lock" : "locks"} active` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={roadLocksOpen}
            onClick={() => setRoadLocksOpen(true)}
          >
            <LockSimple weight="fill" aria-hidden="true" />
            <span>Road locks</span>
            {mustLockCount > 0 ? <span className="road-locks-dock-count" data-tier="must">{mustLockCount}</span> : null}
          </button>
        ) : null}

        {!minimized && bikeProfileMismatch ? (
          <span className="planner-dock-mismatch" role="status">
            <WarningCircle aria-hidden="true" weight="fill" />
            Profile mismatch
          </span>
        ) : null}

        {!minimized && selectedRoute ? (
          <button
            type="button"
            className="clear-route-button"
            onClick={() => {
              setRidePrompt("")
              onClearRoute()
            }}
          >
            Clear route
          </button>
        ) : null}

        {minimized && selectedRoute ? (
          <button
            type="button"
            className="start-new-route-button"
            onClick={() => {
              setRidePrompt("")
              onClearRoute()
            }}
          >
            <X weight="bold" aria-hidden="true" />
            <span>Start new route</span>
          </button>
        ) : null}

        {selectedRoute && onStartRide ? (
          <>
            {!minimized && editing ? (
              <button type="button" className="replan-button" disabled={planDisabled} onClick={onPlan}>
                {status === "routing" ? <SpinnerGap className="spin" aria-hidden="true" /> : <Path weight="bold" aria-hidden="true" />}
                <span>{status === "routing" ? "Replanning…" : "Replan"}</span>
              </button>
            ) : null}
            {!minimized && editing && onSaveOffline ? (
              <button type="button" className="offline-pack-button" onClick={() => setOfflinePackOpen(true)}>
                <DownloadSimple weight="bold" aria-hidden="true" />
                <span>Offline pack</span>
              </button>
            ) : null}
            <button type="button" className="ride-button dock-ride-button" onClick={() => onStartRide(selectedRoute)}>
              <NavigationArrow weight="fill" aria-hidden="true" />
              <span>Start {listProfiles().find((item) => item.id === selectedRoute.profile)?.label ?? "Ride"} route</span>
            </button>
          </>
        ) : editing ? (
          <button type="button" className="plan-button" disabled={planDisabled} onClick={onPlan}>
            {status === "routing" ? <SpinnerGap className="spin" aria-hidden="true" /> : <Path weight="bold" aria-hidden="true" />}
            <span>{planLabel}</span>
          </button>
        ) : null}
      </div>

      <RoadLockLibraryDrawer open={roadLocksOpen} onClose={() => setRoadLocksOpen(false)} />

      {offlinePackOpen && selectedRoute ? (
        <OfflinePackModal
          route={selectedRoute}
          value={downloadMode}
          onChange={setDownloadMode}
          onCancel={() => setOfflinePackOpen(false)}
          onSave={(route) => {
            setOfflinePackOpen(false)
            onSaveOffline?.(route, {
              level: downloadMode.level,
              corridorMiles: downloadMode.corridorMiles
            })
          }}
        />
      ) : null}
    </ContextSheet>
  )
}

interface OfflinePackModalProps {
  route: Parameters<NonNullable<PlannerDeckCommands["onSaveOffline"]>>[0]
  value: DownloadModePickerValue
  onChange(next: DownloadModePickerValue): void
  onCancel(): void
  onSave(route: Parameters<NonNullable<PlannerDeckCommands["onSaveOffline"]>>[0]): void
}

function OfflinePackModal({ route, value, onChange, onCancel, onSave }: OfflinePackModalProps) {
  return (
    <KeyboardScope onEscape={onCancel}>
      <div
        className="offline-pack-modal-scrim"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <aside
          className="offline-pack-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-pack-modal-title"
          tabIndex={-1}
        >
          <header>
            <div><h2 id="offline-pack-modal-title">Offline pack for {route.name}</h2></div>
            <button type="button" className="icon-tool" aria-label="Cancel offline pack" onClick={onCancel}>
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="offline-pack-modal-summary">
            Saving this route as an offline pack lets you resume guidance and turn-by-turn cues when you lose signal. Browser-stored data is not guaranteed permanent — saved-route packs remain recoverable from the server.
          </p>
          <p className="offline-pack-modal-alternative">
            Prefer a file for your Garmin or another GPS device? Use <strong>Export GPX</strong> in the route actions instead — an offline pack stays in Switchback, a GPX goes to your device.
          </p>
          <DownloadModePicker value={value} onChange={onChange} id="offline-pack-download-mode" />
          <footer>
            <button type="button" className="offline-pack-modal-cancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="offline-pack-modal-save" onClick={() => onSave(route)}>
              <DownloadSimple weight="bold" aria-hidden="true" />
              <span>Save offline pack</span>
            </button>
          </footer>
        </aside>
      </div>
    </KeyboardScope>
  )
}
