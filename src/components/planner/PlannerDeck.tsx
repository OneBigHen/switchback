"use client"

import {
  ArrowRight,
  ArrowsDownUp,
  BookOpen,
  CaretDown,
  CaretUp,
  Clock,
  DownloadSimple,
  LockSimple,
  NavigationArrow,
  Microphone,
  MapPin,
  Path,
  Plus,
  SpinnerGap,
  WaveSine,
  WarningCircle,
  X
} from "@phosphor-icons/react"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react"
import { listProfiles } from "@/lib/routing/profiles"
import type { RouteProfileId } from "@/lib/routing/types"
import { BikeProfilePicker } from "./BikeProfilePicker"
import { RoadLockLibraryDrawer } from "./RoadLockLibraryDrawer"
import { WaypointField } from "./WaypointField"
import {
  DOWNLOAD_MODE_PICKER_DEFAULT,
  DownloadModePicker,
  type DownloadModePickerValue
} from "./DownloadModePicker"
import { KeyboardScope } from "./a11y"
import type {
  PlannerDeckCommands,
  PlannerDeckViewModel
} from "./PlannerDeckViewModel"

export type { PlanMode, RideIntentStatus } from "./PlannerDeckViewModel"

interface VoiceRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface VoiceRecognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null
  start(): void
}

type VoiceRecognitionConstructor = new () => VoiceRecognition

interface PlannerDeckProps {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  children?: ReactNode
}

export function PlannerDeck({ viewModel, commands, children }: PlannerDeckProps) {
  /* ── viewModel destructuring ── */
  const { waypoint, rideConfig, intent, ui } = viewModel

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
  const intentStatus = intent.intentStatus
  const intentSummary = intent.intentSummary
  const stopIdeas = intent.stopIdeas
  const researchStatus = intent.researchStatus
  const researchSources = intent.researchSources
  const selectedRoute = ui.selectedRoute ?? null
  const home = ui.home ?? null

  /* ── commands destructuring ── */
  const { waypoint: wc, rideConfig: rc, intent: ic } = commands

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
  const onSegmentProfileChange = rc.onSegmentProfileChange
  const onRemoveAvoidArea = rc.onRemoveAvoidArea

  const onRidePrompt = ic.onRidePrompt
  const onChooseStopIdea = ic.onChooseStopIdea
  const onResearchRideIdea = ic.onResearchRideIdea

  const onClearRoute = commands.onClearRoute
  const onPlan = commands.onPlan
  const onOpenLibrary = commands.onOpenLibrary
  const onUseHome = commands.onUseHome
  const onSaveHome = commands.onSaveHome
  const onClearHome = commands.onClearHome
  const onStartRide = commands.onStartRide
  const onSaveOffline = commands.onSaveOffline
  const [ridePrompt, setRidePrompt] = useState("")
  const [minimized, setMinimized] = useState(false)
  const [editing, setEditing] = useState(false)
  const [exampleIndex, setExampleIndex] = useState(0)
  const [roadLocksOpen, setRoadLocksOpen] = useState(false)
  const [offlinePackOpen, setOfflinePackOpen] = useState(false)
  const [downloadMode, setDownloadMode] = useState<DownloadModePickerValue>(DOWNLOAD_MODE_PICKER_DEFAULT)
  const sheetDragStartRef = useRef<{ pointerId: number; clientY: number } | null>(null)
  const profiles = listProfiles()
  const activeProfile = profiles.find((item) => item.id === profile) ?? profiles[0]
  const durationLabel = targetMinutes % 60 === 0
    ? `${targetMinutes / 60}-hour`
    : `${targetMinutes}-minute`
  const examples = [
    "Costco",
    "Two-hour twisty loop",
    "Scenic ride to New Hope with a coffee stop",
    "123 Market St, Philadelphia, PA",
    "Find gravel roads within 45 minutes",
    "Ride somewhere good for lunch"
  ]
  const intentChips = [
    planMode === "destination" && finish?.label ? finish.label : null,
    planMode === "loop" ? `${durationLabel} loop` : null,
    activeProfile.label,
    via.length > 0 ? `${via.length} ${via.length === 1 ? "stop" : "stops"}` : null,
    avoidHighways ? "No highways" : null
  ].filter((chip): chip is string => Boolean(chip))
  const mustLockCount = rideConfig.roadLocks.filter((lock) => lock.mode === "must").length
  const bikeProfileMismatch = Boolean(selectedRoute) && (() => {
    const bikeCategory = rideConfig.bikeProfile.category
    const routeProfile = selectedRoute!.profile
    if (bikeCategory === "street" || bikeCategory === "touring") return routeProfile === "adventure"
    if (bikeCategory === "adventure") return false
    return routeProfile !== "adventure"
  })()
  useEffect(() => {
    const timer = window.setInterval(() => setExampleIndex((index) => (index + 1) % examples.length), 4200)
    return () => window.clearInterval(timer)
  }, [examples.length])
  const submitRidePrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = ridePrompt.trim()
    if (prompt.length >= 3 && intentStatus !== "interpreting") onRidePrompt(prompt)
  }
  const planDisabled = !start || (planMode === "destination" && !finish) || status === "routing" || intentStatus === "interpreting"
  const planLabel = status === "routing"
    ? "Reading the roads…"
    : planMode === "loop"
      ? `Plan a ${durationLabel} loop`
      : "Plan route"
  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    sheetDragStartRef.current = { pointerId: event.pointerId, clientY: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const handleSheetPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = sheetDragStartRef.current
    sheetDragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId) return
    if (event.clientY - start.clientY >= 64) setMinimized(true)
  }
  const submitQuickIntent = (prompt: string) => {
    setRidePrompt(prompt)
    onRidePrompt(prompt)
  }
  const startVoiceInput = () => {
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
    recognition.start()
  }

  return (
    <aside
      className={`planner-deck${minimized ? " is-minimized" : ""}${selectedRoute && onStartRide && onSaveOffline ? " has-expanded-route-dock" : ""}`}
      aria-label="Motorcycle route planner"
    >
      {minimized ? (
        <div className="planner-mini-header">
          <button type="button" className="planner-expand" aria-label="Expand planner" onClick={() => setMinimized(false)}>
            <span className="brand-mark" aria-hidden="true"><Path weight="bold" /></span>
            <span>
              <small>{selectedRoute ? "Route ready" : "Route planner"}</small>
              <strong>{selectedRoute?.name ?? "Switchback"}</strong>
            </span>
            <CaretUp aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
        <button
          type="button"
          className="planner-sheet-handle"
        aria-label="Collapse planner sheet by dragging down or tapping"
          onClick={() => setMinimized(true)}
          onPointerDown={handleSheetPointerDown}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={() => { sheetDragStartRef.current = null }}
        >
          <span aria-hidden="true" />
        </button>
        <div className="planner-scroll">
        <header className="deck-header ride-deck-header">
          <a className="brand-lockup" href="#top" aria-label="Switchback home">
            <span className="brand-mark" aria-hidden="true"><Path weight="bold" /></span>
            <span>
              <strong>Switchback</strong>
              <small>Ride the better road</small>
            </span>
          </a>
          <div className="deck-header-tools">
            <button type="button" className="planner-minimize" aria-label="Minimize planner" onClick={() => setMinimized(true)}>
              <CaretDown aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="deck-section ride-omnibox-section">
          <div className="ride-intent-heading">
            <span>Ride</span>
            <h1>Where do you want to ride?</h1>
            <p><MapPin weight="fill" aria-hidden="true" /> {start
              ? `Starting from ${start.label ?? "selected start"}`
              : "Current location requested when you plan"}</p>
          </div>
          <form className="ride-omnibox" aria-label="Where do you want to ride?" onSubmit={submitRidePrompt}>
            <MapPin weight="fill" aria-hidden="true" />
            <label className="sr-only" htmlFor="ride-prompt">Where do you want to ride?</label>
            <input
              id="ride-prompt"
              value={ridePrompt}
              onChange={(event) => setRidePrompt(event.target.value)}
              placeholder={examples[exampleIndex]}
              autoComplete="off"
            />
            <button type="button" className="ride-voice-button" aria-label="Start voice input" onClick={startVoiceInput}>
              <Microphone weight="fill" aria-hidden="true" />
            </button>
            <button
              type="submit"
              aria-label="Find ride options"
              disabled={ridePrompt.trim().length < 3 || intentStatus === "interpreting"}
            >
              {intentStatus === "interpreting"
                ? <SpinnerGap className="spin" aria-hidden="true" />
                : <ArrowRight weight="bold" aria-hidden="true" />}
            </button>
          </form>
          <div className="ride-quick-intents" aria-label="Quick ride ideas">
            <button type="button" onClick={() => submitQuickIntent("1-hour loop")}>1-hour loop</button>
            <button type="button" onClick={() => submitQuickIntent("Twisty roads")}>Twisties</button>
            <button type="button" onClick={() => submitQuickIntent("Scenic ride")}>Scenic</button>
          </div>
          {intentChips.length > 0 && intentSummary ? (
            <div className="ride-understanding" aria-label="What Switchback understood">
              <p>{intentSummary}</p>
              <div>{intentChips.map((chip) => <button key={chip} type="button" onClick={() => setEditing(true)}>{chip}</button>)}</div>
            </div>
          ) : (
            <div className="ride-recents" aria-label="Ride examples">
              <span>Try</span>
              <button type="button" onClick={() => submitQuickIntent("Twisty ride to Pine Creek Gorge")}>Pine Creek Gorge <ArrowRight aria-hidden="true" /></button>
              <button type="button" onClick={() => submitQuickIntent("Scenic ride to New Hope with a coffee stop")}>New Hope scenic route <ArrowRight aria-hidden="true" /></button>
            </div>
          )}
          {stopIdeas ? (
            <div className="ride-stop-ideas" aria-label="Suggested route stops">
              <div>
                <strong>{stopIdeas.rankedBy === "rider-fit" ? "Rider-fit stop ideas" : "Nearby stop ideas"}</strong>
                <small>{stopIdeas.rankedBy === "rider-fit" ? "Quality, route proximity, and a mix of breweries, parks, and local stops" : "Nearby OpenStreetMap matches"}</small>
              </div>
              <ol>
                {stopIdeas.places.slice(0, 3).map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => onChooseStopIdea({ lat: place.lat, lon: place.lon, label: place.label })}
                    >
                      <span>
                        <b>{place.name}</b>
                        <small>{place.riderReason ?? (place.rating ? `${place.rating.toFixed(1)} stars` : "Place match")}{place.rating && place.riderReason ? ` · ${place.rating.toFixed(1)} stars` : ""}{place.reviewCount !== undefined ? ` · ${place.reviewCount.toLocaleString()} Google reviews` : ""}</small>
                      </span>
                      <ArrowRight weight="bold" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {editing ? <div className="ride-research">
            <button
              type="button"
              disabled={ridePrompt.trim().length < 3 || researchStatus === "researching"}
              onClick={() => onResearchRideIdea(ridePrompt.trim())}
            >
              {researchStatus === "researching" ? <SpinnerGap className="spin" aria-hidden="true" /> : null}
              {researchStatus === "researching" ? "Researching ideas…" : "Research road & stop ideas"}
            </button>
            <small>Uses current web sources only when you ask for research.</small>
            {researchSources.length > 0 ? (
              <ul aria-label="Web research sources">
                {researchSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      <b>{source.title}</b>
                      <span>{source.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div> : null}
        </div>

        {children}

        <button type="button" className="edit-route-button" onClick={() => setEditing((current) => !current)}>
          {editing ? "Hide route editor" : "Edit route"}
        </button>

        {editing ? <>
        <div className="deck-section profile-section">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Road character</span>
              <h2>{activeProfile.label}</h2>
            </div>
            <span className="profile-glyph"><WaveSine aria-hidden="true" /></span>
          </div>
          <div className="profile-switch" aria-label="Motorcycle routing profile">
            {profiles.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === profile}
                onClick={() => onProfileChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="profile-description">{activeProfile.description}</p>

          <BikeProfilePicker
            value={rideConfig.bikeProfile}
            onChange={(next) => onBikeProfileChange(next)}
            routingProfile={rideConfig.profile}
            id="bike-profile-picker"
          />

          <div className="planner-controls">
            <div className="planner-preferences">
              <label className="curve-toggle">
                <input
                  type="checkbox"
                  checked={curvatureVisible}
                  onChange={(event) => onCurvatureChange(event.target.checked)}
                />
                <span aria-hidden="true" />
                Show high-curvature roads
              </label>
              <label className="curve-toggle highway-toggle">
                <input
                  type="checkbox"
                  checked={avoidHighways}
                  onChange={(event) => onAvoidHighwaysChange(event.target.checked)}
                />
                <span aria-hidden="true" />
                Avoid highways
              </label>
            </div>
            <button type="button" className="library-button" onClick={onOpenLibrary}>
              <BookOpen aria-hidden="true" />
              Library
              {savedCount > 0 ? <span>{savedCount}</span> : null}
            </button>
          </div>

          {error ? (
            <div className="planner-error" role="alert">
              <strong>{error.code === "OUT_OF_COVERAGE" ? "Map region ends here" : "Route unavailable"}</strong>
              <p>{error.message}</p>
            </div>
          ) : null}
        </div>

        <div className="deck-section waypoint-composer">
          <div className="plan-mode-switch" aria-label="Trip shape">
            <button
              type="button"
              aria-pressed={planMode === "loop"}
              onClick={() => onPlanModeChange("loop")}
            >
              Loop ride
            </button>
            <button
              type="button"
              aria-pressed={planMode === "destination"}
              onClick={() => onPlanModeChange("destination")}
            >
              A to B
            </button>
          </div>
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">{planMode === "loop" ? "Time-boxed explorer" : "Route builder"}</span>
              <h1>{planMode === "loop" ? <>Start here.<br />Come home happier.</> : <>Pick two points.<br />Find the fun part.</>}</h1>
            </div>
            {planMode === "destination" ? (
              <button type="button" className="icon-tool" aria-label="Swap start and finish" onClick={onSwap}>
                <ArrowsDownUp aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="waypoint-stack">
            <WaypointField
              id="start"
              label="Start"
              point={start}
              query={startQuery}
              armed={armedPoint === "start"}
              onSelect={(point) => onPointChange("start", point)}
              onQueryChange={(query) => onPointQueryChange("start", query)}
              onArm={() => onArm("start")}
            />
            {planMode === "destination" ? (
              <WaypointField
                id="finish"
                label="Finish"
                point={finish}
                query={finishQuery}
                armed={armedPoint === "finish"}
                onSelect={(point) => onPointChange("finish", point)}
                onQueryChange={(query) => onPointQueryChange("finish", query)}
                onArm={() => onArm("finish")}
              />
            ) : null}
          </div>
          {home || start ? (
            <div className="route-edit-toolbar" aria-label="Home location">
              {home ? <button type="button" onClick={onUseHome}>Use Home</button> : null}
              {start ? <button type="button" onClick={onSaveHome}>Save start as Home</button> : null}
              {home ? <button type="button" onClick={onClearHome}>Remove Home</button> : null}
            </div>
          ) : null}
          {planMode === "loop" ? (
            <div className="time-budget" aria-label="Loop duration">
              <span><Clock aria-hidden="true" /> Ride time</span>
              <div>
                {[60, 90, 120, 180].map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    aria-pressed={minutes === targetMinutes}
                    onClick={() => onTargetMinutesChange(minutes)}
                  >
                    {minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="route-shaping-tools">
            <button
              type="button"
              className="add-via-button"
              aria-pressed={addingVia}
              onClick={onToggleAddVia}
            >
              {addingVia ? <X aria-hidden="true" /> : <Plus weight="bold" aria-hidden="true" />}
              {addingVia ? "Cancel map pick" : "Add stop on map"}
            </button>
            <div className="route-edit-toolbar" aria-label="Route edit history">
              <button
                type="button"
                aria-label="Undo route edit"
                disabled={!canUndoRoutePoints}
                onClick={onUndoRoutePoints}
              >
                Undo
              </button>
              <button
                type="button"
                aria-label="Redo route edit"
                disabled={!canRedoRoutePoints}
                onClick={onRedoRoutePoints}
              >
                Redo
              </button>
              <button
                type="button"
                aria-label="Reverse route"
                disabled={planMode === "destination" ? !start || !finish : via.length === 0}
                onClick={onReverseRoute}
              >
                Reverse
              </button>
            </div>
            {via.length > 0 ? (
              <div className="via-points" aria-label="Shaping stops">
                {via.map((point, index) => (
                  <span key={`${point.lat}-${point.lon}-${index}`}>
                    <b>{index + 1}</b>
                    <span>{point.label ?? `Shaping stop ${index + 1}`}</span>
                    <span className="via-point-actions">
                      <button
                        type="button"
                        aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} earlier`}
                        disabled={index === 0}
                        onClick={() => onMoveVia(index, index - 1)}
                      >
                        <CaretUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} later`}
                        disabled={index === via.length - 1}
                        onClick={() => onMoveVia(index, index + 1)}
                      >
                        <CaretDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${point.label ?? `shaping stop ${index + 1}`}`}
                        onClick={() => onRemoveVia(index)}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {planMode === "destination" && start && finish ? (
              <div className="segment-character-controls" aria-label="Road character by route leg">
                {via.map((point, index) => {
                  const label = point.label ?? `shaping stop ${index + 1}`
                  return (
                    <label key={`segment-${point.lat}-${point.lon}-${index}`}>
                      <span>To {label}</span>
                      <select
                        aria-label={`Ride style to ${label}`}
                        value={segmentProfiles[index] ?? profile}
                        onChange={(event) => onSegmentProfileChange(index, event.currentTarget.value as RouteProfileId)}
                      >
                        {profiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                      <button
                        type="button"
                        aria-label={point.locked ? `Unlock ${label}` : `Lock ${label} as must-use`}
                        aria-pressed={Boolean(point.locked)}
                        onClick={() => onToggleViaLock(index)}
                      >
                        {point.locked ? "Locked" : "Lock"}
                      </button>
                    </label>
                  )
                })}
                <label>
                  <span>To finish</span>
                  <select
                    aria-label="Ride style to finish"
                    value={segmentProfiles[via.length] ?? profile}
                    onChange={(event) => onSegmentProfileChange(via.length, event.currentTarget.value as RouteProfileId)}
                  >
                    {profiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
            {avoidAreaCount > 0 ? (
              <div className="avoid-area-summary">
                <span>{avoidAreaCount} avoid {avoidAreaCount === 1 ? "area" : "areas"} active</span>
                <button type="button" onClick={onRemoveAvoidArea}>Clear latest</button>
              </div>
            ) : null}
          </div>
          {armedPoint ? (
            <p className="map-pick-hint" role="status">
              Tap the map to place your {armedPoint}.
            </p>
          ) : addingVia ? (
            <p className="map-pick-hint" role="status">Tap the map to add a stop. Drag numbered stops later to reshape the route.</p>
          ) : via.length > 0 ? (
            <p className="map-shape-hint">Drag any numbered stop on the map to fine-tune your line.</p>
          ) : null}
        </div>

        </>
        : null}
      </div>
      </>
      )}
      <div className="planner-action-dock" aria-label="Route actions">
        {!minimized ? <button
          type="button"
          className={`road-locks-dock-button${mustLockCount > 0 ? " has-must-locks" : ""}`}
          aria-label={`Open road locks${mustLockCount > 0 ? `, ${mustLockCount} must-use ${mustLockCount === 1 ? "lock" : "locks"} active` : ""}`}
          aria-haspopup="dialog"
          aria-expanded={roadLocksOpen}
          onClick={() => setRoadLocksOpen(true)}
        >
          <LockSimple weight="fill" aria-hidden="true" />
          <span>Road locks</span>
          {mustLockCount > 0 ? (
            <span className="road-locks-dock-count" data-tier="must">{mustLockCount}</span>
          ) : null}
        </button> : null}
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
        {selectedRoute && onStartRide ? (
          <>
            {!minimized && editing ? <button type="button" className="replan-button" disabled={planDisabled} onClick={onPlan}>
              {status === "routing" ? <SpinnerGap className="spin" aria-hidden="true" /> : <Path weight="bold" aria-hidden="true" />}
              <span>{status === "routing" ? "Replanning…" : "Replan"}</span>
            </button> : null}
            {!minimized && editing && onSaveOffline ? (
              <button type="button" className="offline-pack-button" onClick={() => setOfflinePackOpen(true)}>
                <DownloadSimple weight="bold" aria-hidden="true" />
                <span>Offline pack</span>
              </button>
            ) : null}
            <button type="button" className="ride-button dock-ride-button" onClick={() => onStartRide(selectedRoute)}>
              <NavigationArrow weight="fill" aria-hidden="true" />
              <span>Start {selectedRoute.profile === "twisty" ? "Twisty" : selectedRoute.profile === "quick" ? "Quick" : selectedRoute.profile === "scenic" ? "Scenic" : "Adventure"} route</span>
            </button>
          </>
        ) : editing ? (
          <button type="button" className="plan-button" disabled={planDisabled} onClick={onPlan}>
            {status === "routing" ? <SpinnerGap className="spin" aria-hidden="true" /> : <Path weight="bold" aria-hidden="true" />}
            <span>{planLabel}</span>
          </button>
        ) : null}
      </div>

      <RoadLockLibraryDrawer
        open={roadLocksOpen}
        onClose={() => setRoadLocksOpen(false)}
      />

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
    </aside>
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
            <div>
              <span className="eyebrow">Offline pack</span>
              <h2 id="offline-pack-modal-title">{route.name}</h2>
            </div>
            <button
              type="button"
              className="icon-tool"
              aria-label="Cancel offline pack"
              onClick={onCancel}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="offline-pack-modal-summary">
            Saving this route as an offline pack lets you resume guidance and turn-by-turn cues when you lose signal. Browser-stored data is not guaranteed permanent — saved-route packs remain recoverable from the server.
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
