"use client"

import { CaretDown, CaretUp, Clock, LockSimple, Plus, X } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { listProfiles } from "@/lib/routing/profiles"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { BikeProfilePicker } from "../BikeProfilePicker"
import { WaypointField } from "../WaypointField"
import { featureFlags } from "@/lib/domain/feature-flags"
import type { PlannerPointId } from "@/stores/planner-store"

export interface PlanOptionsProps {
  open: boolean
  onToggle(): void
  planMode: "destination" | "loop"
  profile: RouteProfileId
  bikeProfile: BikeProfile
  curvatureVisible: boolean
  avoidHighways: boolean
  targetMinutes: number
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
  onTargetMinutesChange(minutes: number): void
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

function durationLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`
}

function RouteGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Route">{children}</section>
}

function BikeGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Bike">{children}</section>
}

function GeometryGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Geometry">{children}</section>
}

function RoadsGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Roads">{children}</section>
}

function TimingGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Timing">{children}</section>
}

function AdvancedGroup({ children }: { children: ReactNode }) {
  return <section className="plan-v2__option-group" role="group" aria-label="Advanced">{children}</section>
}

export function PlanOptions({
  open,
  onToggle,
  planMode,
  profile,
  bikeProfile,
  curvatureVisible,
  avoidHighways,
  targetMinutes,
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
  onTargetMinutesChange,
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

  return (
    <section className="plan-v2__options" aria-label="Plan options">
      <button
        type="button"
        className="plan-v2__options-trigger"
        aria-expanded={open}
        aria-controls="plan-v2-options-panel"
        onClick={onToggle}
      >
        <span>Options</span>
        {open ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
      </button>
      {open ? (
        <div id="plan-v2-options-panel" className="plan-v2__options-panel">
          <RouteGroup>
            <h3>Route</h3>
            <div className="plan-v2__profile-control" role="group" aria-label="Motorcycle routing profile">
              <span className="plan-v2__control-label">Route preference</span>
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
            {onOpenLibrary ? (
              <button type="button" className="plan-v2__inline-action" onClick={onOpenLibrary}>
                Library{savedCount > 0 ? ` · ${savedCount}` : ""}
              </button>
            ) : null}
            </div>
            <label className="plan-v2__check-row">
              <input type="checkbox" checked={avoidHighways} onChange={(event) => onAvoidHighwaysChange(event.target.checked)} />
              <span>Avoid highways</span>
            </label>
          </RouteGroup>

          <BikeGroup>
            <h3>Bike</h3>
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
          </BikeGroup>

          <GeometryGroup>
            <h3>Geometry</h3>
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
            {via.length > 0 ? (
              <div className="plan-v2__via-points" aria-label="Shaping stops">
                {via.map((point, index) => (
                  <div key={`${point.lat}-${point.lon}-${index}`}>
                    <span><b>{index + 1}</b> {point.label ?? `Shaping stop ${index + 1}`}</span>
                    <span className="plan-v2__via-actions">
                      <button type="button" aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} earlier`} disabled={index === 0} onClick={() => onMoveVia(index, index - 1)}>↑</button>
                      <button type="button" aria-label={`Move ${point.label ?? `shaping stop ${index + 1}`} later`} disabled={index === via.length - 1} onClick={() => onMoveVia(index, index + 1)}>↓</button>
                      <button type="button" aria-label={`Remove ${point.label ?? `shaping stop ${index + 1}`}`} onClick={() => onRemoveVia(index)}>×</button>
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
          </GeometryGroup>

          {planMode === "loop" ? (
            <TimingGroup>
              <h3>Timing</h3>
              <div className="plan-v2__time-budget" aria-label="Loop duration">
                <span><Clock aria-hidden="true" /> Ride time</span>
                <div>
                  {[60, 90, 120, 180].map((minutes) => (
                    <button
                      type="button"
                      key={minutes}
                      aria-pressed={minutes === targetMinutes}
                      onClick={() => onTargetMinutesChange(minutes)}
                    >
                      {durationLabel(minutes)}
                    </button>
                  ))}
                </div>
              </div>
            </TimingGroup>
          ) : null}

          <RoadsGroup>
            <h3>Roads</h3>
            <button type="button" className="plan-v2__road-locks" onClick={onOpenRoadLocks}>
              <LockSimple aria-hidden="true" />
              <span>Preferred / required roads</span>
              {roadLockCount > 0 ? <strong>{roadLockCount}</strong> : null}
            </button>
            {avoidAreaCount > 0 ? (
              <div className="plan-v2__avoid-area-summary">
                <span>{avoidAreaCount} avoid {avoidAreaCount === 1 ? "area" : "areas"} active</span>
                <button type="button" onClick={onRemoveAvoidArea}>Clear latest</button>
              </div>
            ) : null}
          </RoadsGroup>

          {planMode === "destination" && start && finish && segmentProfiles.length > 0 ? (
            <AdvancedGroup>
              <h3>Advanced</h3>
              <p>Route character by leg</p>
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
            </AdvancedGroup>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
