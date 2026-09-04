"use client"

import { CaretDown, CaretUp, Clock, LockSimple, Plus, X } from "@phosphor-icons/react"
import { useState, type ReactNode } from "react"
import { featureFlags } from "@/lib/domain/feature-flags"
import { listProfiles } from "@/lib/routing/profiles"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RouteProfileId, TollPolicy, Waypoint } from "@/lib/routing/types"
import type { PlannerPointId } from "@/stores/planner-store"
import { requestMapEdit } from "../map-edit-command"
import { BikeProfilePicker } from "../BikeProfilePicker"
import { WaypointField } from "../WaypointField"

export interface PlanOptionsProps {
  open: boolean
  onToggle(): void
  planMode: "destination" | "loop"
  profile: RouteProfileId
  bikeProfile: BikeProfile
  curvatureVisible: boolean
  avoidHighways: boolean
  tollPolicy: TollPolicy
  targetMinutes: number
  timeShaped: boolean
  segmentProfiles: RouteProfileId[]
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  via: Waypoint[]
  addingVia: boolean
  canUndoRoutePoints: boolean
  canRedoRoutePoints: boolean
  avoidAreaCount: number
  roadLockCount: number
  savedCount: number
  home: Waypoint | null
  onProfileChange(profile: RouteProfileId): void
  onBikeProfileChange(profile: BikeProfile): void
  onCurvatureChange(visible: boolean): void
  onAvoidHighwaysChange(avoid: boolean): void
  onTollPolicyChange(policy: TollPolicy): void
  onTargetMinutesChange(minutes: number): void
  onTimeShapedChange(shaped: boolean): void
  onSegmentProfileChange(index: number, profile: RouteProfileId): void
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
  onOpenRoadLocks(): void
  onRemoveAvoidArea(): void
  onOpenLibrary?(): void
  onUseHome?(): void
  onSaveHome?(): void
  onClearHome?(): void
}

const LOOP_DURATION_PRESETS = [60, 90, 120, 180] as const
const MIN_CUSTOM_MINUTES = 30
const MAX_CUSTOM_MINUTES = 720

function durationLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`
}

function OptionGroup({ name, children }: { name: string; children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label={name}>{children}</section>
}

export function PlanOptions({
  open,
  onToggle,
  planMode,
  profile,
  bikeProfile,
  curvatureVisible,
  avoidHighways,
  tollPolicy,
  targetMinutes,
  timeShaped,
  segmentProfiles,
  start,
  finish,
  startQuery,
  finishQuery,
  armedPoint,
  via,
  addingVia,
  canUndoRoutePoints,
  canRedoRoutePoints,
  avoidAreaCount,
  roadLockCount,
  savedCount,
  home,
  onProfileChange,
  onBikeProfileChange,
  onCurvatureChange,
  onAvoidHighwaysChange,
  onTollPolicyChange,
  onTargetMinutesChange,
  onTimeShapedChange,
  onSegmentProfileChange,
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
  onOpenRoadLocks,
  onRemoveAvoidArea,
  onOpenLibrary,
  onUseHome,
  onSaveHome,
  onClearHome
}: PlanOptionsProps) {
  const profiles = listProfiles()
  // Loop rides always time-shape; destination rides only when the rider opts in.
  const timeActive = planMode === "loop" || timeShaped
  const targetIsPreset = LOOP_DURATION_PRESETS.includes(targetMinutes as (typeof LOOP_DURATION_PRESETS)[number])
  const [customTimingOpen, setCustomTimingOpen] = useState(!targetIsPreset)
  const [customMinutes, setCustomMinutes] = useState(String(targetMinutes))

  const choosePreset = (minutes: number) => {
    setCustomTimingOpen(false)
    setCustomMinutes(String(minutes))
    onTargetMinutesChange(minutes)
  }

  const updateCustomMinutes = (raw: string) => {
    setCustomMinutes(raw)
    const minutes = Number(raw)
    if (Number.isInteger(minutes) && minutes >= MIN_CUSTOM_MINUTES && minutes <= MAX_CUSTOM_MINUTES) {
      onTargetMinutesChange(minutes)
    }
  }

  return (
    <>
      <button
        type="button"
        className="plan-v2__options-trigger"
        aria-expanded={open}
        aria-controls="plan-v2-options-panel"
        onClick={onToggle}
      >
        <span>Ride options</span>
        {open ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
      </button>

      {open ? (
        <section id="plan-v2-options-panel" className="plan-v2__options-panel" aria-label="Ride options">
          <OptionGroup name="Ride character">
            <h3>Ride character</h3>
            <p>Choose how the ride should feel, then decide whether time or the fastest arrival matters more.</p>
            <div className="plan-v2__profile-control" role="group" aria-label="Motorcycle routing profile">
              <span className="plan-v2__control-label">Road feel</span>
              <div className="plan-v2__profile-list">
                {profiles.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === profile ? "is-selected" : undefined}
                    aria-pressed={item.id === profile}
                    onClick={() => onProfileChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p>{profiles.find((item) => item.id === profile)?.description}</p>
            </div>
            <div className="plan-v2__time-budget" aria-label={planMode === "loop" ? "Loop duration" : "Target ride time"}>
              <span><Clock aria-hidden="true" /> {planMode === "loop" ? "Loop duration" : "Ride time"}</span>
              {planMode === "destination" ? (
                <p>Fastest by default. Set a target to trade extra minutes for roads worth riding.</p>
              ) : null}
              <div className="plan-v2__time-presets">
                {planMode === "destination" ? (
                  <button
                    type="button"
                    aria-pressed={!timeShaped}
                    onClick={() => onTimeShapedChange(false)}
                  >
                    Fastest
                  </button>
                ) : null}
                {LOOP_DURATION_PRESETS.map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    aria-pressed={timeActive && !customTimingOpen && minutes === targetMinutes}
                    onClick={() => {
                      onTimeShapedChange(true)
                      choosePreset(minutes)
                    }}
                  >
                    {durationLabel(minutes)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={timeActive && (customTimingOpen || !targetIsPreset)}
                  onClick={() => {
                    onTimeShapedChange(true)
                    setCustomMinutes(String(targetMinutes))
                    setCustomTimingOpen(true)
                  }}
                >
                  Custom
                </button>
              </div>
              {timeActive && customTimingOpen ? (
                <label className="plan-v2__custom-time">
                  <span>Minutes</span>
                  <input
                    type="number"
                    min={MIN_CUSTOM_MINUTES}
                    max={MAX_CUSTOM_MINUTES}
                    step={15}
                    inputMode="numeric"
                    aria-label={planMode === "loop" ? "Custom loop duration in minutes" : "Target ride time in minutes"}
                    value={customMinutes}
                    onChange={(event) => updateCustomMinutes(event.target.value)}
                  />
                  <small>30–720 min</small>
                </label>
              ) : null}
            </div>
          </OptionGroup>

          <OptionGroup name="Shape route">
            <h3>Shape route</h3>
            <p>Add stops, pull the ride toward roads you want, or change the endpoints. Nothing here changes your overall ride character.</p>
            <div className="plan-v2__waypoint-stack">
              <WaypointField
                id="start"
                label="Start"
                point={start}
                query={startQuery}
                armed={armedPoint === "start"}
                onSelect={(point) => onPointChange("start", point)}
                onQueryChange={(query) => onPointQueryChange("start", query)}
                onArm={() => onArm("start")}
                placeholder="Search start"
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
                  placeholder="Search destination"
                />
              ) : null}
            </div>
            {planMode === "destination" ? (
              <button type="button" className="plan-v2__inline-action" onClick={onSwap}>Swap start and finish</button>
            ) : null}
            {home || start ? (
              <div className="plan-v2__home-actions" aria-label="Home location">
                {home && onUseHome ? <button type="button" onClick={onUseHome}>Use Home</button> : null}
                {start && onSaveHome ? <button type="button" onClick={onSaveHome}>Save start as Home</button> : null}
                {home && onClearHome ? <button type="button" onClick={onClearHome}>Remove Home</button> : null}
              </div>
            ) : null}
            <button type="button" className="plan-v2__inline-action" aria-pressed={addingVia} onClick={onToggleAddVia}>
              {addingVia ? <X aria-hidden="true" /> : <Plus weight="bold" aria-hidden="true" />}
              {addingVia ? "Cancel map pick" : "Add stop on map"}
            </button>
            <button type="button" className="plan-v2__road-locks" aria-label="Prefer a road on map" onClick={() => requestMapEdit("prefer-road")}>
              <LockSimple aria-hidden="true" />
              <span>{featureFlags.roadRequirements ? "Prefer or require a road on map" : "Prefer a road on map"}</span>
            </button>
            <button type="button" className="plan-v2__inline-action" onClick={onOpenRoadLocks}>
              Manage preferred roads{roadLockCount > 0 ? ` · ${roadLockCount}` : ""}
            </button>
            {onOpenLibrary ? (
              <button type="button" className="plan-v2__inline-action" onClick={onOpenLibrary}>
                Open route library{savedCount > 0 ? ` · ${savedCount}` : ""}
              </button>
            ) : null}
            {via.length > 0 ? (
              <div className="plan-v2__via-points" aria-label="Shaping stops">
                {via.map((point, index) => (
                  <div key={`${point.lat}-${point.lon}-${index}`}>
                    <span><b>{index + 1}</b> {point.label ?? `Shaping stop ${index + 1}`}</span>
                    <span className="plan-v2__via-actions">
                      <button type="button" aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} earlier`} disabled={index === 0} onClick={() => onMoveVia(index, index - 1)}>↑</button>
                      <button type="button" aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} later`} disabled={index === via.length - 1} onClick={() => onMoveVia(index, index + 1)}>↓</button>
                      <button type="button" aria-label={`Remove ${point.label ?? `shaping stop ${index + 1}`} `} onClick={() => onRemoveVia(index)}>×</button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="plan-v2__edit-actions" aria-label="Route edit history">
              <button type="button" aria-label="Undo route edit" disabled={!canUndoRoutePoints} onClick={onUndoRoutePoints}>Undo</button>
              <button type="button" aria-label="Redo route edit" disabled={!canRedoRoutePoints} onClick={onRedoRoutePoints}>Redo</button>
              <button type="button" aria-label="Reverse route" disabled={planMode === "destination" ? !start || !finish : via.length === 0} onClick={onReverseRoute}>Reverse</button>
            </div>
          </OptionGroup>

          <OptionGroup name="Avoid">
            <h3>Avoid</h3>
            <p>Keep the route away from roads or areas that do not fit this ride.</p>
            <label className="plan-v2__check-row">
              <input type="checkbox" checked={avoidHighways} onChange={(event) => onAvoidHighwaysChange(event.target.checked)} />
              <span>Avoid highways</span>
            </label>
            <label className="plan-v2__check-row">
              <input
                type="checkbox"
                checked={tollPolicy === "avoid"}
                onChange={(event) => onTollPolicyChange(event.target.checked ? "avoid" : "allow-with-warning")}
              />
              <span>Avoid tolls</span>
            </label>
            <button type="button" className="plan-v2__inline-action" aria-label="Exclude an area on map" onClick={() => requestMapEdit("exclude-area")}>
              Exclude an area on map
            </button>
            {avoidAreaCount > 0 ? (
              <div className="plan-v2__avoid-area-summary">
                <span>{avoidAreaCount} excluded {avoidAreaCount === 1 ? "area" : "areas"} active</span>
                <button type="button" aria-label="Remove latest excluded area" onClick={onRemoveAvoidArea}>Remove latest</button>
              </div>
            ) : null}
          </OptionGroup>

          <OptionGroup name="Bike & map">
            <h3>Bike & map</h3>
            <p>Bike context can change which roads make sense. Map overlays change only what you see.</p>
            <BikeProfilePicker
              value={bikeProfile}
              onChange={onBikeProfileChange}
              routingProfile={profile}
              id="plan-v2-bike-profile-picker"
            />
            <label className="plan-v2__check-row">
              <input type="checkbox" checked={curvatureVisible} onChange={(event) => onCurvatureChange(event.target.checked)} />
              <span>Show high-curvature roads</span>
            </label>
          </OptionGroup>

          {planMode === "destination" && start && finish && segmentProfiles.length > 0 ? (
            <OptionGroup name="Advanced">
              <h3>Advanced</h3>
              <p>Give individual legs a different road character when one profile for the whole ride is not enough.</p>
              {via.map((point, index) => {
                const label = point.label ?? `shaping stop ${index + 1}`
                return (
                  <label key={`segment-${point.lat}-${point.lon}-${index}`} className="plan-v2__segment-row">
                    <span>To {label}</span>
                    <select aria-label={`Ride style to ${label}`} value={segmentProfiles[index] ?? profile} onChange={(event) => onSegmentProfileChange(index, event.target.value as RouteProfileId)}>
                      {profiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                    <button type="button" aria-label={point.locked ? `Unlock ${label}` : `Lock ${label} as must-use`} aria-pressed={Boolean(point.locked)} disabled={!featureFlags.roadRequirements} onClick={() => onToggleViaLock(index)}>
                      {point.locked ? "Locked" : "Lock"}
                    </button>
                  </label>
                )
              })}
              <label className="plan-v2__segment-row">
                <span>To finish</span>
                <select aria-label="Ride style to finish" value={segmentProfiles[via.length] ?? profile} onChange={(event) => onSegmentProfileChange(via.length, event.target.value as RouteProfileId)}>
                  {profiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </OptionGroup>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
