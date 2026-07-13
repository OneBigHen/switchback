"use client"

import {
  ArrowsDownUp,
  BookOpen,
  Path,
  SpinnerGap,
  WaveSine
} from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { listProfiles } from "@/lib/routing/profiles"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { PlannerError, PlannerPointId, PlannerStatus } from "@/stores/planner-store"
import { WaypointField } from "./WaypointField"

interface PlannerDeckProps {
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  profile: RouteProfileId
  status: PlannerStatus
  error: PlannerError | null
  curvatureVisible: boolean
  routerStatus: "checking" | "ready" | "offline"
  savedCount: number
  onPointChange(id: PlannerPointId, point: Waypoint): void
  onPointQueryChange(id: PlannerPointId, query: string): void
  onArm(id: PlannerPointId): void
  onSwap(): void
  onProfileChange(profile: RouteProfileId): void
  onCurvatureChange(visible: boolean): void
  onPlan(): void
  onOpenLibrary(): void
  children?: ReactNode
}

export function PlannerDeck({
  start,
  finish,
  startQuery,
  finishQuery,
  armedPoint,
  profile,
  status,
  error,
  curvatureVisible,
  routerStatus,
  savedCount,
  onPointChange,
  onPointQueryChange,
  onArm,
  onSwap,
  onProfileChange,
  onCurvatureChange,
  onPlan,
  onOpenLibrary,
  children
}: PlannerDeckProps) {
  const profiles = listProfiles()
  const activeProfile = profiles.find((item) => item.id === profile) ?? profiles[0]

  return (
    <aside className="planner-deck" aria-label="Motorcycle route planner">
      <div className="planner-scroll">
        <header className="deck-header">
          <a className="brand-lockup" href="#top" aria-label="Switchback home">
            <span className="brand-mark" aria-hidden="true"><Path weight="bold" /></span>
            <span>
              <strong>Switchback</strong>
              <small>Ride the better road</small>
            </span>
          </a>
          <div className={`engine-status status-${routerStatus}`} title="Routing engine status">
            <span aria-hidden="true" />
            {routerStatus === "ready" ? "Router live" : routerStatus === "offline" ? "Router offline" : "Checking"}
          </div>
        </header>

        <div className="deck-section waypoint-composer">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Route builder</span>
              <h1>Pick two points.<br />Find the fun part.</h1>
            </div>
            <button type="button" className="icon-tool" aria-label="Swap start and finish" onClick={onSwap}>
              <ArrowsDownUp aria-hidden="true" />
            </button>
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
          </div>
          {armedPoint ? (
            <p className="map-pick-hint" role="status">
              Tap the map to place your {armedPoint}.
            </p>
          ) : null}
        </div>

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

          <div className="planner-controls">
            <label className="curve-toggle">
              <input
                type="checkbox"
                checked={curvatureVisible}
                onChange={(event) => onCurvatureChange(event.target.checked)}
              />
              <span aria-hidden="true" />
              Show high-curvature roads
            </label>
            <button type="button" className="library-button" onClick={onOpenLibrary}>
              <BookOpen aria-hidden="true" />
              Library
              {savedCount > 0 ? <span>{savedCount}</span> : null}
            </button>
          </div>

          <button
            type="button"
            className="plan-button"
            disabled={!start || !finish || status === "routing"}
            onClick={onPlan}
          >
            {status === "routing" ? <SpinnerGap className="spin" aria-hidden="true" /> : <Path weight="bold" aria-hidden="true" />}
            <span>{status === "routing" ? "Reading the roads…" : "Build my route"}</span>
          </button>
          {error ? (
            <div className="planner-error" role="alert">
              <strong>{error.code === "OUT_OF_COVERAGE" ? "Map region ends here" : "Route unavailable"}</strong>
              <p>{error.message}</p>
            </div>
          ) : null}
        </div>

        {children}
      </div>
    </aside>
  )
}
