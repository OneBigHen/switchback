"use client"

import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowClockwise,
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretUp,
  FlagCheckered,
  GpsFix,
  GpsSlash,
  X
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { locateRideProgress, type RideProgress } from "@/lib/client/ride-metrics"
import { startRideSession, type RideSession } from "@/lib/client/ride-session"
import { maneuverKind, type ManeuverKind } from "@/lib/client/maneuver"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

interface RideHudProps {
  route: PlannedRoute
  onExit(): void
}

type GpsState = "acquiring" | "ready" | "weak" | "error"

function ManeuverGlyph({ kind }: { kind: ManeuverKind }) {
  if (kind === "left") return <ArrowBendUpLeft weight="bold" />
  if (kind === "right") return <ArrowBendUpRight weight="bold" />
  if (kind === "uturn-left") return <ArrowUUpLeft weight="bold" />
  if (kind === "uturn-right") return <ArrowUUpRight weight="bold" />
  if (kind === "roundabout") return <ArrowClockwise weight="bold" />
  if (kind === "finish") return <FlagCheckered weight="bold" />
  return <CaretUp weight="bold" />
}

function instructionDistance(miles: number): string {
  if (miles < 0.05) return "Now"
  if (miles < 1) return `${Math.max(0.1, Number(miles.toFixed(1)))} mi`
  return `${miles.toFixed(1)} mi`
}

export function RideHud({ route, onExit }: RideHudProps) {
  const sessionRef = useRef<RideSession | null>(null)
  const lastMatchedProgressRef = useRef<RideProgress | null>(null)
  const [location, setLocation] = useState<Coordinate | null>(null)
  const [progress, setProgress] = useState(() => locateRideProgress(route, route.geometry[0]))
  const [gpsMessage, setGpsMessage] = useState("Acquiring GPS")
  const [gpsState, setGpsState] = useState<GpsState>("acquiring")

  useEffect(() => {
    lastMatchedProgressRef.current = null
    if (window.isSecureContext === false) {
      const timeout = window.setTimeout(() => {
        setGpsState("error")
        setGpsMessage("Open Switchback over HTTPS to use live guidance.")
      }, 0)
      return () => window.clearTimeout(timeout)
    }
    let disposed = false
    startRideSession({
      onPosition: (position) => {
        if (disposed) return
        if (position.coords.accuracy > 100) {
          setGpsState("weak")
          setGpsMessage(`Waiting for accurate GPS · ${Math.round(position.coords.accuracy)} m`)
          return
        }
        const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]
        const heading = typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading)
          ? position.coords.heading
          : null
        const nextProgress = locateRideProgress(route, coordinate, {
          headingDegrees: heading,
          previousProgress: lastMatchedProgressRef.current
        })
        if (!nextProgress.matchAmbiguous) lastMatchedProgressRef.current = nextProgress
        setLocation(coordinate)
        setProgress(nextProgress)
        setGpsState("ready")
        setGpsMessage(`${Math.round((position.coords.speed ?? 0) * 2.23694)} mph`)
      },
      onError: (error) => {
        if (!disposed) {
          setGpsState("error")
          setGpsMessage(error.message || "GPS unavailable")
        }
      }
    }).then((session) => {
      if (disposed) void session.stop()
      else sessionRef.current = session
    }).catch(() => {
      if (!disposed) {
        setGpsState("error")
        setGpsMessage("Location permission needed")
      }
    })

    return () => {
      disposed = true
      void sessionRef.current?.stop()
      sessionRef.current = null
    }
  }, [route])

  const guidanceReady = gpsState === "ready" && location !== null
  const matchAmbiguous = guidanceReady && progress.matchAmbiguous
  const instruction = matchAmbiguous ? null : progress.instruction ?? route.instructions[0]
  const offRoute = guidanceReady && progress.offRoute
  const progressReady = guidanceReady && !matchAmbiguous
  const headerLabel = matchAmbiguous ? "Guidance paused" : guidanceReady ? "Guidance beta" : "Route preview"
  const instructionHeading = offRoute
    ? "Return to the highlighted route"
    : matchAmbiguous
      ? "Route match unclear"
    : guidanceReady
      ? instruction?.text ?? "Follow the highlighted route"
      : "GPS fix required"
  const instructionDetail = offRoute
    ? "Automatic rerouting is not enabled. Stop safely if you need to replan."
    : matchAmbiguous
      ? "Guidance is paused until your direction and route position can be matched."
    : guidanceReady
      ? instruction?.streetName || "Stay on route"
      : gpsMessage

  return (
    <section
      className={`ride-hud gps-${gpsState}${offRoute ? " is-off-route" : ""}${matchAmbiguous ? " is-match-ambiguous" : ""}`}
      aria-label={`${guidanceReady ? "Ride mode" : "Ride preview"} for ${route.name}`}
    >
      <header className="ride-topbar">
        <div className="ride-route-name">
          <span className="live-dot" aria-hidden="true" />
          <span>
            <small>{headerLabel}</small>
            <strong>{route.name}</strong>
          </span>
        </div>
        <div className="gps-status">
          <GpsFix aria-hidden="true" /> {gpsState === "error" ? "GPS unavailable" : gpsMessage}
        </div>
        <button type="button" className="ride-exit" aria-label="Exit ride mode" onClick={onExit}>
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="ride-instruction">
        <div className="maneuver-icon" aria-hidden="true">
          {guidanceReady && !matchAmbiguous
            ? <ManeuverGlyph kind={maneuverKind(instruction?.sign ?? 0)} />
            : <GpsSlash weight="bold" />}
        </div>
        <div>
          <span className="eyebrow">
            {offRoute
              ? "Off route"
              : matchAmbiguous
                ? "Position uncertain"
              : guidanceReady
                ? `Next instruction · ${instructionDistance(progress.distanceToInstructionMiles)}`
                : "Guidance paused"}
          </span>
          <h2>{instructionHeading}</h2>
          <p>{instructionDetail}</p>
        </div>
      </div>

      <footer className="ride-telemetry">
        <div>
          <strong>{(progressReady ? progress.remainingMiles : route.distanceMiles).toFixed(1)}</strong>
          <span>{progressReady ? "miles left" : "planned miles"}</span>
        </div>
        <div>
          <strong>{Math.max(0, Math.round(route.durationMinutes * (progressReady ? 1 - progress.percent / 100 : 1)))}</strong>
          <span>{progressReady ? "minutes" : "planned min"}</span>
        </div>
        <div className="ride-progress-readout">
          <strong>{progressReady ? Math.round(progress.percent) : 0}%</strong>
          <span>{matchAmbiguous ? "route match pending" : progressReady ? "route complete" : "waiting for GPS"}</span>
        </div>
        <div className="ride-progress-track" aria-label={`${progressReady ? Math.round(progress.percent) : 0} percent complete`}>
          <span style={{ width: `${progressReady ? progress.percent : 0}%` }} />
        </div>
      </footer>
    </section>
  )
}
