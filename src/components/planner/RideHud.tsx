"use client"

import {
  ArrowClockwise,
  Bookmarks,
  GpsFix,
  GpsSlash,
  Pause,
  Play,
  SpinnerGap,
  SpeakerHigh,
  SpeakerSlash,
  X
} from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildNavigationModel,
  completedWaypointIndexes,
  updateNavigation,
  type NavigationFrame
} from "@/lib/client/navigation-engine"
import { startRideSession, type RideSession } from "@/lib/client/ride-session"
import { maneuverKind } from "@/lib/client/maneuver"
import { ManeuverGlyph } from "./maneuver-glyph"
import { RideHudStatus } from "./RideHudStatus"
import { RideRecoveryActions } from "./RideRecoveryActions"
import { RideWeatherAlert } from "./RideWeatherAlert"
import { requestTripPlan } from "@/lib/client/routing-client"
import { requestRouteWeather, sampleRouteWeatherPoints } from "@/lib/client/weather-client"
import { buildRideRecoveryCheckpoint } from "@/lib/client/ride-recovery-checkpoint"
import { buildReroutePoints, type RideRerouteMode } from "@/lib/client/ride-reroute"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import type { RouteWeatherAlert } from "@/lib/weather/types"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"
import { clearRideRecovery, loadRideRecovery, saveRideRecovery, type RideDeviationRecord } from "@/lib/storage/ride-recovery"
import { navigationStore } from "@/stores/navigation-store"
import { useRideFuelDetour } from "./useRideFuelDetour"

interface RideHudProps {
  route: PlannedRoute
  onExit(): void
  onReroute?(route: PlannedRoute): void
  onRideRecorded?(input: { route: PlannedRoute; points: RecordedRidePoint[] }): void
  onNavigationFrame?(frame: NavigationFrame | null): void
}

type GpsState = "acquiring" | "ready" | "weak" | "error"
type RejoinPolicy = "nearest-safe" | "next-shaping" | "skip-point" | "preserve-original" | "fuel-detour"

function instructionDistance(meters: number): string {
  if (meters <= 35) return "Now"
  if (meters < 160) return `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft`
  const miles = meters / 1609.344
  if (miles < 1) return `${Math.max(0.1, Number(miles.toFixed(1)))} mi`
  return `${miles.toFixed(1)} mi`
}

type RecoveryMode = RejoinPolicy | "automatic"
const AUTOMATIC_REROUTE_DELAY_MS = 8_000
const STALE_GPS_AFTER_MS = 20_000

const DISMISSED_RIDE_ALERTS_KEY = "switchback.dismissed-ride-alerts.v1"

function loadDismissedRideAlerts(): string[] {
  if (typeof window === "undefined") return []
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DISMISSED_RIDE_ALERTS_KEY) ?? "[]")
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function saveDismissedRideAlerts(alertIds: string[]): void {
  try {
    window.sessionStorage.setItem(DISMISSED_RIDE_ALERTS_KEY, JSON.stringify(alertIds))
  } catch {
    // Dismissal still works for this mount when storage is unavailable.
  }
}

export function RideHud({ route, onExit, onReroute, onRideRecorded, onNavigationFrame }: RideHudProps) {
  const navigationModel = useMemo(() => buildNavigationModel(route), [route])
  const initialFrame = useMemo(() => updateNavigation(navigationModel, {
    coordinate: route.geometry[0] ?? [0, 0],
    accuracyMeters: 5,
    headingDegrees: null,
    speedMetersPerSecond: 0,
    timestamp: 0
  }), [navigationModel, route.geometry])
  const sessionRef = useRef<RideSession | null>(null)
  const lastFrameRef = useRef<NavigationFrame | null>(null)
  const lastGpsFixAtRef = useRef<number | null>(null)
  const lastReliableFrameRef = useRef<NavigationFrame>(initialFrame)
  const completedWaypointIndexesRef = useRef<number[]>([])
  const deviationHistoryRef = useRef<RideDeviationRecord[]>([])
  const rerouteInFlightRef = useRef(false)
  const rerouteVersionRef = useRef(0)
  const rerouteAbortRef = useRef<AbortController | null>(null)
  const automaticRerouteStartedRef = useRef(false)
  const rerouteHandlerRef = useRef(onReroute)
  const navigationFrameHandlerRef = useRef(onNavigationFrame)
  const rerouteActionRef = useRef<(frame: NavigationFrame, mode: RecoveryMode, fuelStop?: PlaceResult) => void>(() => undefined)
  const voiceEnabledRef = useRef(true)
  const guidancePausedRef = useRef(false)
  const spokenInstructionRef = useRef<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recordingRef = useRef(false)
  const recordedPointsRef = useRef<RecordedRidePoint[]>([])
  const [location, setLocation] = useState<Coordinate | null>(null)
  const [navigationFrame, setNavigationFrame] = useState(initialFrame)
  const [lastReliableFrame, setLastReliableFrame] = useState(initialFrame)
  const [gpsMessage, setGpsMessage] = useState("Acquiring GPS")
  const [gpsState, setGpsState] = useState<GpsState>("acquiring")
  const [rerouteStatus, setRerouteStatus] = useState<"idle" | "routing" | "error">("idle")
  const [rejoinPolicy, setRejoinPolicy] = useState<RejoinPolicy | null>(null)
  const [alertResult, setAlertResult] = useState<{ routeId: string; alert: RouteWeatherAlert | null } | null>(null)
  const [dismissedAlertIds, setDismissedAlertIds] = useState(loadDismissedRideAlerts)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [guidancePaused, setGuidancePaused] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sessionAttempt, setSessionAttempt] = useState(0)

  useEffect(() => {
    rerouteHandlerRef.current = onReroute
    navigationFrameHandlerRef.current = onNavigationFrame
  }, [onNavigationFrame, onReroute])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const rootWasLocked = root.classList.contains("ride-mode-active")
    const bodyWasLocked = body.classList.contains("ride-mode-active")
    root.classList.add("ride-mode-active")
    body.classList.add("ride-mode-active")

    return () => {
      if (!rootWasLocked) root.classList.remove("ride-mode-active")
      if (!bodyWasLocked) body.classList.remove("ride-mode-active")
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const points = sampleRouteWeatherPoints(route.geometry)
    if (points.length === 0) return () => controller.abort()
    void requestRouteWeather(points, fetch, controller.signal)
      .then((weather) => {
        const alert = weather.samples.flatMap((sample) => sample.alerts)[0] ?? null
        setAlertResult({ routeId: route.id, alert })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [route.geometry, route.id])

  useEffect(() => {
    rerouteActionRef.current = (frame, mode, fuelStop) => {
      if (mode === "preserve-original") {
        setRejoinPolicy(mode)
        setRerouteStatus("idle")
        automaticRerouteStartedRef.current = false
        return
      }
      if (rerouteInFlightRef.current) return

      const points = buildReroutePoints({
        route,
        navigationModel,
        trustedFrame: lastReliableFrameRef.current,
        currentFrame: frame,
        completedWaypointIndexes: completedWaypointIndexesRef.current,
        mode: mode as RideRerouteMode,
        fuelStop
      })
      if (!points) {
        setRerouteStatus("error")
        return
      }

      const requestVersion = ++rerouteVersionRef.current
      const requestController = new AbortController()
      rerouteAbortRef.current?.abort()
      rerouteAbortRef.current = requestController
      rerouteInFlightRef.current = true
      setRejoinPolicy(mode === "automatic" ? null : mode)
      setRerouteStatus("routing")
      void requestTripPlan({
        profile: route.profile,
        compare: false,
        avoidHighways: route.avoidHighways,
        avoidAreas: route.avoidAreas,
        points
      }, fetch, requestController.signal).then((plan) => {
        if (requestVersion !== rerouteVersionRef.current) return
        if (rerouteAbortRef.current === requestController) rerouteAbortRef.current = null
        const rerouted = plan.routes.find((candidate) => candidate.id === plan.selectedRouteId) ?? plan.routes[0]
        rerouteInFlightRef.current = false
        if (!rerouted) {
          setRerouteStatus("error")
          return
        }
        setRerouteStatus("idle")
        rerouteHandlerRef.current?.(rerouted)
      }).catch(() => {
        if (requestVersion !== rerouteVersionRef.current) return
        if (rerouteAbortRef.current === requestController) rerouteAbortRef.current = null
        setRerouteStatus("error")
        rerouteInFlightRef.current = false
        automaticRerouteStartedRef.current = false
      })
    }
    return () => {
      rerouteActionRef.current = () => undefined
    }
  }, [navigationModel, route])

  useEffect(() => {
    lastFrameRef.current = null
    lastGpsFixAtRef.current = null
    lastReliableFrameRef.current = initialFrame
    completedWaypointIndexesRef.current = []
    deviationHistoryRef.current = []
    guidancePausedRef.current = false
    rerouteInFlightRef.current = false
    automaticRerouteStartedRef.current = false
    spokenInstructionRef.current = null
    let recoveryTimeout: number | null = null
    const pauseResetTimeout = window.setTimeout(() => setGuidancePaused(false), 0)
    const checkpoint = loadRideRecovery(route.id)
    const checkpointCoordinate = checkpoint ? route.geometry[checkpoint.nearestGeometryIndex] : null
    if (checkpoint && checkpointCoordinate) {
      completedWaypointIndexesRef.current = checkpoint.completedWaypointIndexes ?? []
      deviationHistoryRef.current = checkpoint.deviationHistory ?? []
      guidancePausedRef.current = Boolean(checkpoint.pausedAt)
      const restored = updateNavigation(navigationModel, {
        coordinate: checkpointCoordinate,
        accuracyMeters: 5,
        headingDegrees: null,
        speedMetersPerSecond: 0,
        timestamp: Date.parse(checkpoint.savedAt)
      })
      lastFrameRef.current = restored
      lastReliableFrameRef.current = restored
      recoveryTimeout = window.setTimeout(() => {
        setNavigationFrame(restored)
        navigationStore.setFrame(restored)
        setLastReliableFrame(restored)
        setGuidancePaused(Boolean(checkpoint.pausedAt))
        setGpsMessage(`Restored ${Math.round(checkpoint.percent)}% ride checkpoint`)
      }, 0)
    }
    if (window.isSecureContext === false) {
      const timeout = window.setTimeout(() => {
        setGpsState("error")
        setGpsMessage("Open Switchback over HTTPS to use live guidance.")
      }, 0)
      return () => {
        window.clearTimeout(timeout)
        window.clearTimeout(pauseResetTimeout)
        if (recoveryTimeout != null) window.clearTimeout(recoveryTimeout)
      }
    }
    let disposed = false
    const staleGpsInterval = window.setInterval(() => {
      const lastFixAt = lastGpsFixAtRef.current
      if (disposed || lastFixAt == null || Date.now() - lastFixAt <= STALE_GPS_AFTER_MS) return
      setGpsState("weak")
      setGpsMessage("GPS signal stale · waiting for a fresh location")
    }, 5_000)
    startRideSession({
      onPosition: (position) => {
        if (disposed) return
        lastGpsFixAtRef.current = Date.now()
        const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]
        if (recordingRef.current && position.coords.accuracy <= 50) {
          const now = new Date(position.timestamp || Date.now()).toISOString()
          const last = recordedPointsRef.current.at(-1)
          const movedEnough = !last || Math.hypot(
            coordinate[0] - last.coordinate[0],
            coordinate[1] - last.coordinate[1]
          ) > 0.00008
          const elapsedEnough = !last || Date.parse(now) - Date.parse(last.recordedAt) >= 15_000
          if (movedEnough || elapsedEnough) {
            recordedPointsRef.current.push({
              coordinate,
              recordedAt: now,
              speedMph: position.coords.speed == null ? null : Number((position.coords.speed * 2.23694).toFixed(1))
            })
          }
        }
        const heading = typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading)
          ? position.coords.heading
          : null
        const previousFrame = lastFrameRef.current
        const nextFrame = updateNavigation(navigationModel, {
          coordinate,
          accuracyMeters: position.coords.accuracy,
          headingDegrees: heading,
          speedMetersPerSecond: position.coords.speed,
          timestamp: position.timestamp || Date.now()
        }, previousFrame ?? undefined)
        lastFrameRef.current = nextFrame
        const reliable = nextFrame.status === "navigating" || nextFrame.status === "arrived"
        if (reliable) {
          lastReliableFrameRef.current = nextFrame
          completedWaypointIndexesRef.current = [...new Set([
            ...completedWaypointIndexesRef.current,
            ...completedWaypointIndexes(route, nextFrame)
          ])]
          setLastReliableFrame(nextFrame)
          automaticRerouteStartedRef.current = false
          if (nextFrame.status === "arrived") clearRideRecovery()
          else {
            const savedAt = new Date().toISOString()
            saveRideRecovery(buildRideRecoveryCheckpoint({
              route,
              frame: nextFrame,
              completedWaypointIndexes: completedWaypointIndexesRef.current,
              deviationHistory: deviationHistoryRef.current,
              savedAt,
              paused: guidancePausedRef.current
            }))
          }
        }
        if (nextFrame.status === "off-route" && previousFrame?.status !== "off-route") {
          deviationHistoryRef.current = [...deviationHistoryRef.current, {
            detectedAt: new Date(nextFrame.timestamp).toISOString(),
            coordinate: nextFrame.rawCoordinate,
            distanceFromRouteMeters: Math.round(nextFrame.distanceFromRouteMeters)
          }].slice(-20)
          const recoveryFrame = lastReliableFrameRef.current
          const savedAt = new Date().toISOString()
          saveRideRecovery(buildRideRecoveryCheckpoint({
            route,
            frame: recoveryFrame,
            completedWaypointIndexes: completedWaypointIndexesRef.current,
            deviationHistory: deviationHistoryRef.current,
            savedAt,
            paused: guidancePausedRef.current
          }))
        }
        setLocation(coordinate)
        setNavigationFrame(nextFrame)
        navigationStore.setFrame(nextFrame)
        navigationFrameHandlerRef.current?.(nextFrame)
        if (nextFrame.status === "weak-signal") {
          setGpsState("weak")
          setGpsMessage(`Waiting for accurate GPS · ${Math.round(position.coords.accuracy)} m`)
        } else {
          setGpsState("ready")
          setGpsMessage(`${Math.round((position.coords.speed ?? 0) * 2.23694)} mph`)
        }
        if (
          nextFrame.status === "off-route" && nextFrame.offRouteSince != null &&
          nextFrame.timestamp - nextFrame.offRouteSince >= AUTOMATIC_REROUTE_DELAY_MS &&
          !automaticRerouteStartedRef.current && !guidancePausedRef.current
        ) {
          automaticRerouteStartedRef.current = true
          rerouteActionRef.current(nextFrame, "automatic")
        }
        const spokenInstruction = nextFrame.status === "navigating" ? nextFrame.instruction : null
        const voiceStage = nextFrame.distanceToInstructionMeters <= 35
          ? "now"
          : nextFrame.distanceToInstructionMeters <= 180
            ? "soon"
            : nextFrame.distanceToInstructionMeters <= 800
              ? "prepare"
              : null
        const spokenKey = spokenInstruction
          ? `${nextFrame.instructionIndex}:${voiceStage}`
          : null
        if (
          !guidancePausedRef.current && voiceEnabledRef.current && spokenInstruction && spokenKey && voiceStage &&
          spokenKey !== spokenInstructionRef.current &&
          typeof window.speechSynthesis !== "undefined" &&
          typeof SpeechSynthesisUtterance !== "undefined"
        ) {
          if (typeof AudioContext !== "undefined") {
            if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
            const ac = audioCtxRef.current
            const osc = ac.createOscillator()
            const gain = ac.createGain()
            osc.connect(gain)
            gain.connect(ac.destination)
            osc.frequency.value = voiceStage === "now" ? 1200 : 880
            gain.gain.value = 0.15
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15)
            osc.start()
            osc.stop(ac.currentTime + 0.15)
          }
          const distance = instructionDistance(nextFrame.distanceToInstructionMeters)
          const cue = distance === "Now"
            ? `${spokenInstruction.text}${spokenInstruction.streetName ? ` onto ${spokenInstruction.streetName}` : ""}`
            : `In ${distance}, ${spokenInstruction.text}${spokenInstruction.streetName ? ` onto ${spokenInstruction.streetName}` : ""}`
          window.speechSynthesis.cancel()
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(cue))
          spokenInstructionRef.current = spokenKey
        }
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
      rerouteVersionRef.current += 1
      rerouteAbortRef.current?.abort()
      rerouteAbortRef.current = null
      rerouteInFlightRef.current = false
      if (recoveryTimeout != null) window.clearTimeout(recoveryTimeout)
      window.clearTimeout(pauseResetTimeout)
      window.clearInterval(staleGpsInterval)
      void sessionRef.current?.stop()
      sessionRef.current = null
      navigationStore.clear()
      navigationFrameHandlerRef.current?.(null)
    }
  }, [initialFrame, navigationModel, route, sessionAttempt])

  const guidanceReady = gpsState === "ready" && location !== null
  const matchAmbiguous = guidanceReady && navigationFrame.status === "uncertain"
  const instruction = matchAmbiguous ? null : navigationFrame.instruction ?? route.instructions[0]
  const offRoute = guidanceReady && navigationFrame.status === "off-route"
  const deviating = guidanceReady && navigationFrame.status === "deviating"
  const arrived = guidanceReady && navigationFrame.status === "arrived"
  const progressReady = guidanceReady && !matchAmbiguous && !offRoute && !deviating
  const displayFrame = progressReady ? navigationFrame : lastReliableFrame
  const currentInstruction = guidanceReady ? navigationFrame.instruction : null
  const currentSpeedLimit = currentInstruction?.speedLimitKmh ?? null
  const currentRideAlert = alertResult?.routeId === route.id ? alertResult.alert : null
  const rideAlert = currentRideAlert && !dismissedAlertIds.includes(currentRideAlert.id)
    ? currentRideAlert
    : null
  const dismissRideAlert = () => {
    if (!rideAlert) return
    const nextDismissedAlertIds = [...new Set([...dismissedAlertIds, rideAlert.id])]
    setDismissedAlertIds(nextDismissedAlertIds)
    saveDismissedRideAlerts(nextDismissedAlertIds)
  }
  const toggleVoice = () => {
    const enabled = !voiceEnabledRef.current
    voiceEnabledRef.current = enabled
    setVoiceEnabled(enabled)
    if (!enabled && typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel()
  }
  const toggleGuidancePause = () => {
    const paused = !guidancePausedRef.current
    guidancePausedRef.current = paused
    setGuidancePaused(paused)
    const frame = lastReliableFrameRef.current
    const savedAt = new Date().toISOString()
    saveRideRecovery(buildRideRecoveryCheckpoint({
      route,
      frame,
      completedWaypointIndexes: completedWaypointIndexesRef.current,
      deviationHistory: deviationHistoryRef.current,
      savedAt,
      paused
    }))
    if (paused && typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel()
  }
  const pauseForOvernightStop = () => {
    if (!guidancePausedRef.current) toggleGuidancePause()
  }
  const retryGps = () => {
    setGpsState("acquiring")
    setGpsMessage("Acquiring GPS")
    setSessionAttempt((attempt) => attempt + 1)
  }
  const toggleRecording = () => {
    if (recordingRef.current) {
      recordingRef.current = false
      setRecording(false)
      if (recordedPointsRef.current.length >= 2) {
        onRideRecorded?.({ route, points: recordedPointsRef.current })
      }
      return
    }
    recordedPointsRef.current = location ? [{
      coordinate: location,
      recordedAt: new Date().toISOString(),
      speedMph: null
    }] : []
    recordingRef.current = true
    setRecording(true)
  }
  const exitRide = () => {
    if (recordingRef.current && recordedPointsRef.current.length >= 2) {
      onRideRecorded?.({ route, points: recordedPointsRef.current })
    }
    recordingRef.current = false
    setRecording(false)
    if (navigationFrame.status === "arrived") clearRideRecovery()
    onExit()
  }
  const requestRejoin = (policy: RejoinPolicy) => {
    rerouteActionRef.current(lastFrameRef.current ?? navigationFrame, policy)
  }
  const { fuelStops, findFuel, selectFuelStop } = useRideFuelDetour({
    routeId: route.id,
    onChooseFuelStop(frame, fuelStop) {
      rerouteActionRef.current(frame, "fuel-detour", fuelStop)
    }
  })
  const headerLabel = guidancePaused
    ? "Guidance paused"
    : arrived
    ? "Arrived"
    : matchAmbiguous
      ? "Guidance paused"
      : deviating
        ? "Checking position"
        : guidanceReady ? "Live guidance" : "Route preview"
  const instructionEyebrow = offRoute
    ? "Off route"
    : arrived
      ? "Destination"
    : deviating
      ? "Verifying position"
    : matchAmbiguous
      ? "Position uncertain"
    : guidanceReady
      ? `Next instruction · ${instructionDistance(navigationFrame.distanceToInstructionMeters)}`
      : "Guidance paused"
  const instructionHeading = guidancePaused
    ? "Guidance paused"
    : offRoute
    ? rerouteStatus === "routing" ? "Finding a safe way back…" : "Return to the highlighted route"
    : arrived
      ? "You have arrived"
    : deviating
      ? "Checking your route position"
    : matchAmbiguous
      ? "Route match unclear"
    : guidanceReady
      ? instruction?.text ?? "Follow the highlighted route"
      : "GPS fix required"
  const instructionDetail = guidancePaused
    ? "Resume when you are ready for route cues and automatic recovery."
    : offRoute
    ? rerouteStatus === "routing"
      ? "Switchback is rebuilding the line from your current location."
      : rerouteStatus === "error"
        ? "The requested rejoin route failed. Stop safely before trying again."
        : rejoinPolicy === "preserve-original"
          ? "Your original route is preserved. Choose a rejoin point when it is safe."
          : "Choose a recovery option, or keep moving and Switchback will recalculate automatically."
    : arrived
      ? route.waypoints.at(-1)?.label || "Destination reached"
    : deviating
      ? "GPS is outside the route corridor. Guidance will only reroute if the deviation continues."
    : matchAmbiguous
      ? "Guidance is paused until your direction and route position can be matched."
    : guidanceReady
      ? instruction?.streetName || "Stay on route"
      : gpsMessage

  return (
    <section
      className={`ride-hud gps-${gpsState}${offRoute ? " is-off-route" : ""}${deviating ? " is-deviating" : ""}${arrived ? " is-arrived" : ""}${matchAmbiguous ? " is-match-ambiguous" : ""}`}
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
        <button
          type="button"
          className="ride-voice-toggle"
          aria-label={voiceEnabled ? "Mute voice guidance" : "Enable voice guidance"}
          aria-pressed={voiceEnabled}
          onClick={toggleVoice}
        >
          {voiceEnabled ? <SpeakerHigh aria-hidden="true" /> : <SpeakerSlash aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="ride-voice-toggle"
          aria-label={guidancePaused ? "Resume guidance" : "Pause guidance"}
          aria-pressed={guidancePaused}
          onClick={toggleGuidancePause}
        >
          {guidancePaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="ride-voice-toggle"
          aria-label="Pause for overnight stop"
          disabled={guidancePaused}
          onClick={pauseForOvernightStop}
        >
          <Bookmarks aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`ride-record-toggle${recording ? " is-recording" : ""}`}
          aria-label={recording ? "Stop ride recording" : "Start ride recording"}
          aria-pressed={recording}
          onClick={toggleRecording}
        >
          {recording ? "REC" : "Record"}
        </button>
        <button type="button" className="ride-exit" aria-label="Exit ride mode" onClick={exitRide}>
          <X aria-hidden="true" />
        </button>
      </header>

      {rideAlert ? <RideWeatherAlert alert={rideAlert} onDismiss={dismissRideAlert} /> : null}

      <div className="ride-instruction">
        <div className="maneuver-icon" aria-hidden="true">
          {guidanceReady && !matchAmbiguous
            ? arrived
              ? <ManeuverGlyph kind="finish" />
              : rerouteStatus === "routing"
              ? <SpinnerGap className="spin" />
              : <ManeuverGlyph kind={maneuverKind(instruction?.sign ?? 0)} />
            : <GpsSlash weight="bold" />}
        </div>
        <div role="status" aria-live="polite">
          <RideHudStatus eyebrow={instructionEyebrow} heading={instructionHeading} detail={instructionDetail} />
          {guidanceReady && !offRoute && !deviating && !arrived &&
           ["straight", "continue", "depart"].includes(maneuverKind(instruction?.sign ?? 0)) &&
           navigationFrame.distanceToInstructionMeters > 800 &&
           instruction?.streetName ? (
            <small className="ride-continue-cue">
              Continue on {instruction.streetName} for {(navigationFrame.distanceToInstructionMeters / 1609.344).toFixed(1)} mi
            </small>
          ) : null}
          {guidanceReady && !offRoute && !deviating && !arrived && navigationFrame.thenInstruction &&
          navigationFrame.distanceToInstructionMeters <= 300 ? (
            <small className="ride-then-cue">
              Then {navigationFrame.thenInstruction.text.toLowerCase()}
              {navigationFrame.thenInstruction.streetName ? ` onto ${navigationFrame.thenInstruction.streetName}` : ""}
            </small>
          ) : null}
          {offRoute ? (
            <div className="ride-reroute-card" role="group" aria-label="Choose a route rejoin option">
              <RideRecoveryActions
                rerouteStatus={rerouteStatus}
                rejoinPolicy={rejoinPolicy}
                fuelStops={fuelStops}
                onRequestRejoin={requestRejoin}
                onFindFuel={() => findFuel(lastFrameRef.current ?? navigationFrame)}
                onSelectFuelStop={(fuelStop) => selectFuelStop(lastFrameRef.current ?? navigationFrame, fuelStop)}
              />
            </div>
          ) : null}
          {gpsState === "error" && window.isSecureContext !== false ? (
            <button type="button" className="gps-retry-button" onClick={retryGps}>
              <ArrowClockwise aria-hidden="true" />
              Try GPS again
            </button>
          ) : null}
        </div>
      </div>

      <footer className="ride-telemetry">
        <div>
          <strong>{(guidanceReady ? displayFrame.remainingDistanceMeters / 1609.344 : route.distanceMiles).toFixed(1)}</strong>
          <span>{guidanceReady ? "miles left" : "planned miles"}</span>
        </div>
        <div>
          <strong>{Math.max(0, Math.round(guidanceReady ? displayFrame.remainingDurationSeconds / 60 : route.durationMinutes))}</strong>
          <span>{guidanceReady ? "minutes" : "planned min"}</span>
        </div>
        <div className="ride-speed-badge" aria-live="off">
          <strong>
            {guidanceReady && displayFrame.speedMetersPerSecond != null
              ? Math.round(displayFrame.speedMetersPerSecond * 2.237)
              : 0}
          </strong>
          <span>mph</span>
        </div>
        {currentSpeedLimit != null ? (
          <div className="ride-speed-limit" aria-label={`Speed limit ${Math.round(currentSpeedLimit * 0.621371)} miles per hour`}>
            <span className="ride-speed-limit-value">{Math.round(currentSpeedLimit * 0.621371)}</span>
          </div>
        ) : null}
        <div className="ride-progress-readout" role="status" aria-label={`${guidanceReady ? Math.round(displayFrame.routePercent) : 0} percent complete`}>
          <strong>{guidanceReady ? Math.round(displayFrame.routePercent) : 0}%</strong>
          <span>{arrived ? "ride complete" : matchAmbiguous ? "route match pending" : guidanceReady ? "route progress" : "waiting for GPS"}</span>
        </div>
        <div className="ride-progress-track" aria-hidden="true">
          <span style={{ width: `${guidanceReady ? displayFrame.routePercent : 0}%` }} />
        </div>
      </footer>
    </section>
  )
}
