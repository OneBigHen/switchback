"use client"

import {
  ArrowClockwise,
  Bookmarks,
  FastForward,
  NavigationArrow,
  Path
} from "@phosphor-icons/react"
import type { PlaceResult } from "@/lib/geocoding/photon"

export type RejoinPolicy =
  | "nearest-safe"
  | "next-shaping-point"
  | "skip-point"
  | "preserve-original"
  | "fuel-detour"
export type FuelStopOption = PlaceResult
export type FuelStopsState = {
  status: "idle" | "loading" | "error" | "ready"
  places: FuelStopOption[]
}

interface RideRecoveryActionsProps {
  rerouteStatus: "idle" | "routing" | "error"
  rejoinPolicy: RejoinPolicy | null
  fuelStops: FuelStopsState
  onRequestRejoin(policy: RejoinPolicy): void
  onFindFuel(): void
  onSelectFuelStop(fuelStop: FuelStopOption): void
}

/**
 * Pure display component for the off-route recovery card's actionable body.
 *
 * Receives pre-resolved state (reroute status, rejoin policy, fuel-stops
 * state) plus three callbacks. No effects, no browser APIs, no storage —
 * RideHud owns the recovery flow and passes closures that capture the
 * current navigation frame.
 *
 * The `routing` status renders a single loading row; any other status
 * renders the fixed set of recovery buttons plus the optional fuel-stop
 * list / error message.
 */
export function RideRecoveryActions({
  rerouteStatus,
  fuelStops,
  onRequestRejoin,
  onFindFuel,
  onSelectFuelStop
}: RideRecoveryActionsProps) {
  if (rerouteStatus === "routing") {
    return (
      <div className="ride-reroute-loading">
        <ArrowClockwise aria-hidden="true" />
        <span>Finding a safe way back…</span>
      </div>
    )
  }
  return (
    <>
      <button type="button" className="reroute-option" onClick={() => onRequestRejoin("nearest-safe")}>
        <span className="reroute-option-icon" aria-hidden="true"><NavigationArrow weight="fill" /></span>
        <span className="reroute-option-text">
          <strong>Nearest rejoin</strong>
          <small>Return to closest point on the route</small>
        </span>
      </button>
      <button type="button" className="reroute-option" onClick={() => onRequestRejoin("next-shaping-point")}>
        <span className="reroute-option-icon" aria-hidden="true"><Path weight="fill" /></span>
        <span className="reroute-option-text">
          <strong>Next stop</strong>
          <small>Rejoin at the next waypoint</small>
        </span>
      </button>
      <button type="button" className="reroute-option" onClick={() => onRequestRejoin("skip-point")}>
        <span className="reroute-option-icon" aria-hidden="true"><FastForward weight="fill" /></span>
        <span className="reroute-option-text">
          <strong>Skip next stop</strong>
          <small>Continue past the upcoming waypoint</small>
        </span>
      </button>
      <button type="button" className="reroute-option" onClick={onFindFuel} disabled={fuelStops.status === "loading"}>
        <span className="reroute-option-icon" aria-hidden="true"><NavigationArrow weight="fill" /></span>
        <span className="reroute-option-text">
          <strong>{fuelStops.status === "loading" ? "Finding fuel…" : "Find fuel"}</strong>
          <small>Choose a mapped fuel stop before rerouting</small>
        </span>
      </button>
      {fuelStops.status === "ready" ? fuelStops.places.map((fuelStop) => (
        <button key={fuelStop.id} type="button" className="reroute-option reroute-option-secondary" onClick={() => onSelectFuelStop(fuelStop)}>
          <span className="reroute-option-text">
            <strong>Route to {fuelStop.name}</strong>
            <small>{fuelStop.label}</small>
          </span>
        </button>
      )) : null}
      {fuelStops.status === "error" ? <small className="ride-reroute-error">No mapped fuel stops were available nearby.</small> : null}
      <button type="button" className="reroute-option reroute-option-secondary" onClick={() => onRequestRejoin("preserve-original")}>
        <span className="reroute-option-icon" aria-hidden="true"><Bookmarks weight="fill" /></span>
        <span className="reroute-option-text">
          <strong>Keep original</strong>
          <small>Preserve the planned route as-is</small>
        </span>
      </button>
    </>
  )
}
