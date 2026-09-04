"use client"

import { ArrowRight, CaretDown, MapPin, Microphone, NavigationArrow, SpinnerGap, X } from "@phosphor-icons/react"
import { useCallback, useEffect, type FormEvent } from "react"
import type { PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { PlannerError, PlannerPointId, PlanningPhase } from "@/stores/planner-store"
import type { PlanMode, PlannerProviderHealthViewModel } from "../PlannerDeckViewModel"
import { ProviderHealthNotice } from "../ProviderHealthNotice"
import { PlanModeSelector } from "./PlanModeSelector"
import { PlanOptions } from "./PlanOptions"

export interface PlanComposerProps {
  planMode: PlanMode
  onPlanModeChange(mode: PlanMode): void
  onDraw(): void
  ridePrompt: string
  onRidePromptChange(prompt: string): void
  onRidePromptSubmit(event: FormEvent<HTMLFormElement>): void
  onStartVoiceInput(): void
  onUseCurrentLocation?(): void
  onMinimize?(): void
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  via: Waypoint[]
  addingVia: boolean
  canUndoRoutePoints: boolean
  canRedoRoutePoints: boolean
  profile: RouteProfileId
  bikeProfile: BikeProfile
  curvatureVisible: boolean
  avoidHighways: boolean
  targetMinutes: number
  timeShaped: boolean
  segmentProfiles: RouteProfileId[]
  avoidAreaCount: number
  roadLockCount: number
  savedCount: number
  home: Waypoint | null
  providerHealth?: PlannerProviderHealthViewModel
  onRetryProviderHealth?(): void
  intentStatus: "idle" | "interpreting"
  planningPhase: PlanningPhase
  lifecycleLabel: string
  elapsedSeconds: number
  error: PlannerError | null
  editing: boolean
  onEditingChange(editing: boolean): void
  onCancelPlanning(): void
  onPointChange(id: PlannerPointId, point: Waypoint): void
  onPointQueryChange(id: PlannerPointId, query: string): void
  onArm(id: PlannerPointId): void
  onSwap(): void
  onToggleAddVia(): void
  onRemoveVia(index: number): void
  onMoveVia(fromIndex: number, toIndex: number): void
  onReverseRoute(): void
  onUndoRoutePoints(): void
  onRedoRoutePoints(): void
  onToggleViaLock(index: number): void
  onProfileChange(profile: RouteProfileId): void
  onBikeProfileChange(profile: BikeProfile): void
  onCurvatureChange(visible: boolean): void
  onAvoidHighwaysChange(avoid: boolean): void
  onTargetMinutesChange(minutes: number): void
  onTimeShapedChange(shaped: boolean): void
  onSegmentProfileChange(index: number, profile: RouteProfileId): void
  onOpenRoadLocks(): void
  onRemoveAvoidArea(): void
  onOpenLibrary?(): void
  onUseHome?(): void
  onSaveHome?(): void
  onClearHome?(): void
  onStartFreeRide?(): void
  stopIdeas?: PlaceIdeasResult | null
  onChooseStopIdea?(stop: Waypoint): void
  researchStatus?: "idle" | "researching"
  researchSources?: RideResearchSource[]
  onResearchRideIdea?(prompt: string): void
}

const SETTLED_PLANNING_PHASES = new Set<PlanningPhase>(["idle", "ready", "error", "cancelled"])

export function PlanComposer({
  planMode,
  onPlanModeChange,
  onDraw,
  ridePrompt,
  onRidePromptChange,
  onRidePromptSubmit,
  onStartVoiceInput,
  onUseCurrentLocation,
  onMinimize,
  start,
  finish,
  startQuery,
  finishQuery,
  armedPoint,
  via,
  addingVia,
  canUndoRoutePoints,
  canRedoRoutePoints,
  profile,
  bikeProfile,
  curvatureVisible,
  avoidHighways,
  targetMinutes,
  timeShaped,
  segmentProfiles,
  avoidAreaCount,
  roadLockCount,
  savedCount,
  home,
  providerHealth,
  onRetryProviderHealth,
  intentStatus,
  planningPhase,
  lifecycleLabel,
  elapsedSeconds,
  error,
  editing,
  onEditingChange,
  onCancelPlanning,
  onPointChange,
  onPointQueryChange,
  onArm,
  onSwap,
  onToggleAddVia,
  onRemoveVia,
  onMoveVia,
  onReverseRoute,
  onUndoRoutePoints,
  onRedoRoutePoints,
  onToggleViaLock,
  onProfileChange,
  onBikeProfileChange,
  onCurvatureChange,
  onAvoidHighwaysChange,
  onTargetMinutesChange,
  onTimeShapedChange,
  onSegmentProfileChange,
  onOpenRoadLocks,
  onRemoveAvoidArea,
  onOpenLibrary,
  onUseHome,
  onSaveHome,
  onClearHome,
  onStartFreeRide,
  stopIdeas,
  onChooseStopIdea,
  researchStatus = "idle",
  researchSources = [],
  onResearchRideIdea
}: PlanComposerProps) {
  const placeholder = planMode === "loop" ? "Where should the loop start?" : "Search a place or describe a ride"
  const planningBusy = !SETTLED_PLANNING_PHASES.has(planningPhase)
  const intentBusy = intentStatus === "interpreting"
  const requestBusy = intentBusy || planningBusy
  const placementActive = armedPoint !== null || addingVia
  // Route planning can be superseded by a newer rider prompt. Keep the
  // interpretation request single-flight, but do not strand the omnibox
  // while a provider response is still in flight; the planning gate owns
  // stale-response cancellation and latest-intent selection.
  const canSubmitRequest = ridePrompt.trim().length >= 3 && !intentBusy

  const cancelPlacement = useCallback(() => {
    if (addingVia) {
      onToggleAddVia()
      return
    }
    if (armedPoint) onArm(armedPoint)
  }, [addingVia, armedPoint, onArm, onToggleAddVia])

  useEffect(() => {
    if (!placementActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      cancelPlacement()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [cancelPlacement, placementActive])

  return (
    <div className="plan-v2" data-plan-mode={planMode} data-editing={editing ? "true" : "false"}>
      {providerHealth ? <ProviderHealthNotice health={providerHealth} onRetry={onRetryProviderHealth} /> : null}

      {/* V2.1 W1 §5: while planning, the lifecycle status (with Cancel) leads
          the composer so it stays above the fold even with the options panel
          expanded — the strip used to render after it and disappear below. */}
      {planningBusy ? (
        <div className="plan-v2__status" role="status" aria-label="Ride planning progress" aria-live="polite">
          <SpinnerGap className="spin" aria-hidden="true" />
          <span>{lifecycleLabel}{elapsedSeconds >= 1 ? ` · ${elapsedSeconds}s` : ""}</span>
          <button type="button" aria-label="Cancel planning" onClick={onCancelPlanning}>Cancel</button>
        </div>
      ) : null}

      <div className="plan-v2__compact-rail">
        <form
          className="plan-v2__search"
          aria-label="Ride request"
          aria-busy={requestBusy}
          onSubmit={onRidePromptSubmit}
        >
          {onUseCurrentLocation ? (
            <button
              type="button"
              className="plan-v2__location-control"
              aria-label={start ? "Change start" : "Use current location"}
              title={start ? `Start: ${start.label ?? "selected location"}` : "Use current location"}
              onClick={onUseCurrentLocation}
            >
              <MapPin weight="fill" aria-hidden="true" />
            </button>
          ) : (
            <span className="plan-v2__location-marker" aria-hidden="true"><MapPin weight="fill" /></span>
          )}
          <label className="sr-only" htmlFor="ride-prompt">Ride request</label>
          <input
            id="ride-prompt"
            name="ride-prompt"
            value={ridePrompt}
            onChange={(event) => onRidePromptChange(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <button
            type="button"
            className="plan-v2__voice-control"
            aria-label="Start voice input"
            disabled={requestBusy}
            onClick={onStartVoiceInput}
          >
            <Microphone weight="fill" aria-hidden="true" />
          </button>
          <button type="submit" className="plan-v2__submit-control" aria-label="Find ride options" disabled={!canSubmitRequest}>
            {requestBusy ? <SpinnerGap className="spin" aria-hidden="true" /> : <ArrowRight weight="bold" aria-hidden="true" />}
          </button>
        </form>

        <div className="plan-v2__action-rail">
          <PlanModeSelector
            value={planMode}
            onChange={onPlanModeChange}
            onDraw={onDraw}
            disabled={requestBusy}
          />
          {onStartFreeRide ? (
            <button type="button" className="plan-v2__free-ride" disabled={requestBusy} onClick={onStartFreeRide}>
              <NavigationArrow weight="fill" aria-hidden="true" />
              <span>Free Ride</span>
            </button>
          ) : null}
          <PlanOptions
            open={editing}
            onToggle={() => onEditingChange(!editing)}
            planMode={planMode}
            profile={profile}
            bikeProfile={bikeProfile}
            curvatureVisible={curvatureVisible}
            avoidHighways={avoidHighways}
            targetMinutes={targetMinutes}
            timeShaped={timeShaped}
            segmentProfiles={segmentProfiles}
            start={start}
            finish={finish}
            startQuery={startQuery}
            finishQuery={finishQuery}
            armedPoint={armedPoint}
            via={via}
            addingVia={addingVia}
            canUndoRoutePoints={canUndoRoutePoints}
            canRedoRoutePoints={canRedoRoutePoints}
            avoidAreaCount={avoidAreaCount}
            roadLockCount={roadLockCount}
            savedCount={savedCount}
            home={home}
            onProfileChange={onProfileChange}
            onBikeProfileChange={onBikeProfileChange}
            onCurvatureChange={onCurvatureChange}
            onAvoidHighwaysChange={onAvoidHighwaysChange}
            onTimeShapedChange={onTimeShapedChange}
            onTargetMinutesChange={onTargetMinutesChange}
            onSegmentProfileChange={onSegmentProfileChange}
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
            onOpenRoadLocks={onOpenRoadLocks}
            onRemoveAvoidArea={onRemoveAvoidArea}
            onOpenLibrary={onOpenLibrary}
            onUseHome={onUseHome}
            onSaveHome={onSaveHome}
            onClearHome={onClearHome}
          />
          {onMinimize ? (
            <button type="button" className="plan-v2__minimize-control" aria-label="Minimize planner" onClick={onMinimize}>
              <CaretDown weight="bold" aria-hidden="true" />
            </button>
          ) : null}
          {placementActive ? (
            <button type="button" className="plan-v2__placement-cancel" aria-label="Cancel map placement" onClick={cancelPlacement}>
              <X weight="bold" aria-hidden="true" />
              <span>Cancel placement</span>
              <kbd>Esc</kbd>
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="plan-v2__error" role="alert">
          <strong>{error.code === "OUT_OF_COVERAGE" ? "Map region ends here" : "Route unavailable"}</strong>
          <p>{error.message}</p>
        </div>
      ) : null}

      <div className="plan-v2__contextual-content">
        {stopIdeas && onChooseStopIdea ? (
          <div className="plan-v2__stop-ideas" aria-label="Suggested route stops">
            <strong>{stopIdeas.rankedBy === "rider-fit" ? "Rider-fit stop ideas" : "Nearby stop ideas"}</strong>
            <ol>
              {stopIdeas.places.slice(0, 3).map((place) => (
                <li key={place.id}>
                  <button type="button" onClick={() => onChooseStopIdea({ lat: place.lat, lon: place.lon, label: place.label })}>
                    <span><b>{place.name}</b><small>{place.riderReason ?? (place.rating ? `${place.rating.toFixed(1)} stars` : "Place match")}</small></span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {editing && onResearchRideIdea ? (
          <div className="plan-v2__research">
            <button
              type="button"
              disabled={ridePrompt.trim().length < 3 || researchStatus === "researching"}
              onClick={() => onResearchRideIdea(ridePrompt.trim())}
            >
              {researchStatus === "researching" ? <SpinnerGap className="spin" aria-hidden="true" /> : null}
              {researchStatus === "researching" ? "Researching ideas…" : "Research road & stop ideas"}
            </button>
            {researchSources.length > 0 ? (
              <ul aria-label="Web research sources">
                {researchSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      <b>{source.title}</b><span>{source.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
