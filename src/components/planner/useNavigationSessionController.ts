import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import {
  buildNavigationModel,
  completedWaypointIndexes,
  updateNavigation
} from "@/lib/client/navigation-engine"
import { startRideSession, type RideSession } from "@/lib/client/ride-session"
import { requestTripPlan } from "@/lib/client/routing-client"
import { requestRouteWeather, sampleRouteWeatherPoints } from "@/lib/client/weather-client"
import { buildRideRecoveryCheckpoint } from "@/lib/client/ride-recovery-checkpoint"
import { buildReroutePoints, type RideRerouteMode } from "@/lib/client/ride-reroute"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import type { RouteWeatherAlert } from "@/lib/weather/types"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"
import {
  clearRideRecovery,
  loadRideRecovery,
  saveRideRecovery,
  type RideDeviationRecord
} from "@/lib/storage/ride-recovery"
import {
  createNavigationSessionState,
  navigationSessionReducer,
  selectViewModel,
  type NavigationSessionState,
  type NavigationSessionViewModel
} from "@/lib/client/navigation-session"
import { navigationStore } from "@/stores/navigation-store"

export type GpsState = "acquiring" | "ready" | "weak" | "error"
export type RejoinPolicy = "nearest-safe" | "next-shaping-point" | "skip-point" | "preserve-original" | "fuel-detour"

const AUTOMATIC_REROUTE_DELAY_MS = 8_000
const STALE_GPS_AFTER_MS = 20_000

export interface NavigationSessionControllerInput {
  route: PlannedRoute
  onExit(): void
  onReroute?(route: PlannedRoute): void
  onRideRecorded?(input: { route: PlannedRoute; points: RecordedRidePoint[] }): void
  onNavigationFrame?(frame: NavigationFrame | null): void
}

export interface NavigationSessionController {
  viewModel: NavigationSessionViewModel
  gpsState: GpsState
  gpsMessage: string
  rerouteStatus: "idle" | "routing" | "error"
  rejoinPolicy: RejoinPolicy | null
  rideAlert: RouteWeatherAlert | null
  voiceEnabled: boolean
  guidancePaused: boolean
  recording: boolean
  location: Coordinate | null
  toggleVoice(): void
  toggleGuidancePause(): void
  pauseForOvernightStop(): void
  retryGps(): void
  toggleRecording(): void
  exitRide(): void
  dismissRideAlert(): void
  requestRejoin(policy: RejoinPolicy): void
  selectFuelStop(fuelStop: PlaceResult): void
}

export function instructionDistance(meters: number): string {
  if (meters <= 35) return "Now"
  if (meters < 160) return `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft`
  const miles = meters / 1609.344
  if (miles < 1) return `${Math.max(0.1, Number(miles.toFixed(1)))} mi`
  return `${miles.toFixed(1)} mi`
}

type RecoveryMode = RejoinPolicy | "automatic"

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

export function useNavigationSessionController({
  route,
  onExit,
  onReroute,
  onRideRecorded,
  onNavigationFrame
}: NavigationSessionControllerInput): NavigationSessionController {
  const navigationModel = useMemo(() => buildNavigationModel(route), [route])
  const initialFrame = useMemo(
    () => updateNavigation(navigationModel, {
      coordinate: route.geometry[0] ?? [0, 0],
      accuracyMeters: 5,
      headingDegrees: null,
      speedMetersPerSecond: 0,
      timestamp: 0
    }),
    [navigationModel, route.geometry]
  )

  const [sessionState, setSessionState] = useState<NavigationSessionState>(createNavigationSessionState)
  // The onPosition closure lives in an effect that must not re-run on every
  // phase change, so the phase is mirrored into a ref for fresh reads inside
  // that closure (otherwise acquireFix would never fire and the session
  // phase would stay stuck at "acquiring" forever).
  const sessionPhaseRef = useRef<NavigationSessionState["phase"]>(createNavigationSessionState().phase)
  useEffect(() => {
    sessionPhaseRef.current = sessionState.phase
  }, [sessionState.phase])
  const [frame, setFrame] = useState<NavigationFrame>(initialFrame)
  const [gpsState, setGpsState] = useState<GpsState>("acquiring")
  const [gpsMessage, setGpsMessage] = useState("Acquiring GPS")
  const [rerouteStatus, setRerouteStatus] = useState<"idle" | "routing" | "error">("idle")
  const [rejoinPolicy, setRejoinPolicy] = useState<RejoinPolicy | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [guidancePaused, setGuidancePaused] = useState(false)
  const [recording, setRecording] = useState(false)
  const [location, setLocation] = useState<Coordinate | null>(null)
  const [alertResult, setAlertResult] = useState<{
    routeId: string
    alert: RouteWeatherAlert | null
  } | null>(null)
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(loadDismissedRideAlerts)
  const [sessionAttempt, setSessionAttempt] = useState(0)

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
  const exitHandlerRef = useRef(onExit)
  const rideRecordedHandlerRef = useRef(onRideRecorded)
  const voiceEnabledRef = useRef(true)
  const guidancePausedRef = useRef(false)
  const spokenInstructionRef = useRef<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recordingRef = useRef(false)
  const recordedPointsRef = useRef<RecordedRidePoint[]>([])
  const rerouteActionRef = useRef<
    (frame: NavigationFrame, mode: RecoveryMode, fuelStop?: PlaceResult) => void
  >(() => undefined)

  useEffect(() => {
    rerouteHandlerRef.current = onReroute
  }, [onReroute])

  useEffect(() => {
    navigationFrameHandlerRef.current = onNavigationFrame
  }, [onNavigationFrame])

  useEffect(() => {
    exitHandlerRef.current = onExit
  }, [onExit])

  useEffect(() => {
    rideRecordedHandlerRef.current = onRideRecorded
  }, [onRideRecorded])

  const dispatch = useCallback((cmd: Parameters<typeof navigationSessionReducer>[1]) => {
    setSessionState((prev) => navigationSessionReducer(prev, cmd).state)
  }, [])

  const dampedSetFrame = useCallback((next: NavigationFrame) => {
    setFrame(next)
    navigationStore.setFrame(next)
    navigationFrameHandlerRef.current?.(next)
  }, [])

  const viewModel = useMemo(
    () => selectViewModel(sessionState, frame),
    [sessionState, frame]
  )

  const rideAlert =
    alertResult?.routeId === route.id &&
    alertResult.alert &&
    !dismissedAlertIds.includes(alertResult.alert.id)
      ? alertResult.alert
      : null

  const dismissRideAlert = useCallback(() => {
    if (!rideAlert) return
    const next = [...new Set([...dismissedAlertIds, rideAlert.id])]
    setDismissedAlertIds(next)
    saveDismissedRideAlerts(next)
  }, [rideAlert, dismissedAlertIds])

  const toggleVoice = useCallback(() => {
    const enabled = !voiceEnabledRef.current
    voiceEnabledRef.current = enabled
    setVoiceEnabled(enabled)
    if (!enabled && typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel()
    }
  }, [])

  const toggleGuidancePause = useCallback(() => {
    const paused = !guidancePausedRef.current
    guidancePausedRef.current = paused
    setGuidancePaused(paused)
    const reliable = lastReliableFrameRef.current
    const savedAt = new Date().toISOString()
    saveRideRecovery(
      buildRideRecoveryCheckpoint({
        route,
        frame: reliable,
        completedWaypointIndexes: completedWaypointIndexesRef.current,
        deviationHistory: deviationHistoryRef.current,
        savedAt,
        paused
      })
    )
    if (paused && typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel()
    }
  }, [route])

  const pauseForOvernightStop = useCallback(() => {
    if (!guidancePausedRef.current) toggleGuidancePause()
  }, [toggleGuidancePause])

  const retryGps = useCallback(() => {
    setGpsState("acquiring")
    setGpsMessage("Acquiring GPS")
    setSessionAttempt((a) => a + 1)
  }, [])

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) {
      dispatch({ type: "finishRecording" })
      recordingRef.current = false
      setRecording(false)
      if (recordedPointsRef.current.length >= 2) {
        rideRecordedHandlerRef.current?.({ route, points: recordedPointsRef.current })
      }
      return
    }
    dispatch({ type: "beginRecording" })
    recordedPointsRef.current = location
      ? [{ coordinate: location, recordedAt: new Date().toISOString(), speedMph: null }]
      : []
    recordingRef.current = true
    setRecording(true)
  }, [dispatch, route, location])

  const exitRide = useCallback(() => {
    dispatch({ type: "stop" })
    if (recordingRef.current && recordedPointsRef.current.length >= 2) {
      rideRecordedHandlerRef.current?.({ route, points: recordedPointsRef.current })
    }
    recordingRef.current = false
    setRecording(false)
    if (frame.status === "arrived") clearRideRecovery()
    exitHandlerRef.current?.()
  }, [dispatch, route, frame.status])

  const executeReroute = useCallback(
    (
      navFrame: NavigationFrame,
      mode: RecoveryMode,
      fuelStop?: PlaceResult
    ) => {
      if (mode === "preserve-original") {
        // The rider explicitly chose to keep the planned route: cancel any
        // in-flight reroute and suppress the automatic reroute. Previously
        // this re-armed the automatic reroute and left the request running,
        // so the route was replaced seconds later anyway.
        rerouteVersionRef.current += 1
        rerouteAbortRef.current?.abort()
        rerouteAbortRef.current = null
        rerouteInFlightRef.current = false
        automaticRerouteStartedRef.current = true
        setRejoinPolicy(mode)
        setRerouteStatus("idle")
        return
      }
      if (rerouteInFlightRef.current) return

      const points = buildReroutePoints({
        route,
        navigationModel,
        trustedFrame: lastReliableFrameRef.current,
        currentFrame: navFrame,
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
      dispatch({
        type: "requestReroute",
        policy: mode === "automatic" ? "nearest-safe" : mode as RejoinPolicy
      })
      setRejoinPolicy(mode === "automatic" ? null : mode)
      setRerouteStatus("routing")

      // The reducer's REROUTE_TIMEOUT effect is not executed by this
      // controller (it drives the session lifecycle directly), so enforce the
      // same 30s ceiling here: a hung routing request must not leave the HUD
      // stuck on "Finding a safe way back…" indefinitely.
      const rerouteDeadline = AbortSignal.timeout(30_000)
      const rerouteSignal = AbortSignal.any([requestController.signal, rerouteDeadline])

      void requestTripPlan(
        {
          profile: route.profile,
          compare: false,
          avoidHighways: route.avoidHighways,
          avoidAreas: route.avoidAreas,
          points
        },
        fetch,
        rerouteSignal
      ).then((plan) => {
        if (requestVersion !== rerouteVersionRef.current) return
        if (rerouteAbortRef.current === requestController) rerouteAbortRef.current = null
        const rerouted = plan.routes.find((c) => c.id === plan.selectedRouteId) ?? plan.routes[0]
        rerouteInFlightRef.current = false
        if (!rerouted) {
          setRerouteStatus("error")
          return
        }
        dispatch({ type: "cancelReroute" })
        setRerouteStatus("idle")
        rerouteHandlerRef.current?.(rerouted)
      }).catch(() => {
        if (requestVersion !== rerouteVersionRef.current) return
        if (rerouteAbortRef.current === requestController) rerouteAbortRef.current = null
        setRerouteStatus("error")
        rerouteInFlightRef.current = false
        automaticRerouteStartedRef.current = false
      })
    },
    [route, navigationModel, dispatch]
  )

  useEffect(() => {
    rerouteActionRef.current = executeReroute
  })

  const requestRejoin = useCallback(
    (policy: RejoinPolicy) => {
      executeReroute(lastFrameRef.current ?? frame, policy)
    },
    [frame, executeReroute]
  )

  const selectFuelStop = useCallback(
    (fuelStop: PlaceResult) => {
      executeReroute(lastFrameRef.current ?? frame, "fuel-detour", fuelStop)
    },
    [frame, executeReroute]
  )

  const speakInstruction = useCallback(
    (
      navFrame: NavigationFrame,
      spokenInstruction: { text: string; streetName?: string } | null
    ) => {
      if (
        guidancePausedRef.current ||
        !voiceEnabledRef.current ||
        !spokenInstruction
      )
        return

      const voiceStage =
        navFrame.distanceToInstructionMeters <= 35
          ? "now"
          : navFrame.distanceToInstructionMeters <= 180
            ? "soon"
            : navFrame.distanceToInstructionMeters <= 800
              ? "prepare"
              : null
      if (!voiceStage) return

      const spokenKey = `${navFrame.instructionIndex}:${voiceStage}`
      if (spokenKey === spokenInstructionRef.current) return
      if (
        typeof window.speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined"
      )
        return

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

      const distance = instructionDistance(navFrame.distanceToInstructionMeters)
      const cue =
        distance === "Now"
          ? `${spokenInstruction.text}${spokenInstruction.streetName ? ` onto ${spokenInstruction.streetName}` : ""}`
          : `In ${distance}, ${spokenInstruction.text}${spokenInstruction.streetName ? ` onto ${spokenInstruction.streetName}` : ""}`
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(cue))
      spokenInstructionRef.current = spokenKey
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    const points = sampleRouteWeatherPoints(route.geometry)
    if (points.length === 0) return () => controller.abort()
    void requestRouteWeather(points, fetch, controller.signal)
      .then((weather) => {
        const alert =
          weather.samples.flatMap((s) => s.alerts)[0] ?? null
        setAlertResult({ routeId: route.id, alert })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [route.geometry, route.id])

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
    const checkpointCoordinate = checkpoint
      ? route.geometry[checkpoint.nearestGeometryIndex]
      : null

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
        dampedSetFrame(restored)
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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- startRideSession must begin on every route change
    dispatch({ type: "start", routeId: route.id })

    startRideSession({
      onPosition: (position) => {
        if (disposed) return
        lastGpsFixAtRef.current = Date.now()
        const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]

        if (recordingRef.current && position.coords.accuracy <= 50) {
          const now = new Date(position.timestamp || Date.now()).toISOString()
          const last = recordedPointsRef.current.at(-1)
          const movedEnough =
            !last ||
            Math.hypot(
              coordinate[0] - last.coordinate[0],
              coordinate[1] - last.coordinate[1]
            ) > 0.00008
          const elapsedEnough =
            !last ||
            Date.parse(now) - Date.parse(last.recordedAt) >= 15_000
          if (movedEnough || elapsedEnough) {
            recordedPointsRef.current.push({
              coordinate,
              recordedAt: now,
              speedMph:
                position.coords.speed == null
                  ? null
                  : Number((position.coords.speed * 2.23694).toFixed(1))
            })
          }
        }

        const heading =
          typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading)
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
          completedWaypointIndexesRef.current = [
            ...new Set([
              ...completedWaypointIndexesRef.current,
              ...completedWaypointIndexes(route, nextFrame)
            ])
          ]
          automaticRerouteStartedRef.current = false
          if (nextFrame.status === "arrived") {
            clearRideRecovery()
          } else {
            const savedAt = new Date().toISOString()
            saveRideRecovery(
              buildRideRecoveryCheckpoint({
                route,
                frame: nextFrame,
                completedWaypointIndexes: completedWaypointIndexesRef.current,
                deviationHistory: deviationHistoryRef.current,
                savedAt,
                paused: guidancePausedRef.current
              })
            )
          }
        }

        if (
          nextFrame.status === "off-route" &&
          previousFrame?.status !== "off-route"
        ) {
          deviationHistoryRef.current = [
            ...deviationHistoryRef.current,
            {
              detectedAt: new Date(nextFrame.timestamp).toISOString(),
              coordinate: nextFrame.rawCoordinate,
              distanceFromRouteMeters: Math.round(nextFrame.distanceFromRouteMeters)
            }
          ].slice(-20)

          const recoveryFrame = lastReliableFrameRef.current
          const savedAt = new Date().toISOString()
          saveRideRecovery(
            buildRideRecoveryCheckpoint({
              route,
              frame: recoveryFrame,
              completedWaypointIndexes: completedWaypointIndexesRef.current,
              deviationHistory: deviationHistoryRef.current,
              savedAt,
              paused: guidancePausedRef.current
            })
          )
        }

        setLocation(coordinate)
        dampedSetFrame(nextFrame)

        if (nextFrame.status === "weak-signal") {
          setGpsState("weak")
          setGpsMessage(`Waiting for accurate GPS · ${Math.round(position.coords.accuracy)} m`)
        } else {
          setGpsState("ready")
          setGpsMessage(
            `${Math.round((position.coords.speed ?? 0) * 2.23694)} mph`
          )
        }

        if (
          sessionPhaseRef.current === "acquiring" ||
          sessionPhaseRef.current === "recovering"
        ) {
          dispatch({ type: "acquireFix" })
        }

        if (
          nextFrame.status === "off-route" &&
          nextFrame.offRouteSince != null &&
          nextFrame.timestamp - nextFrame.offRouteSince >= AUTOMATIC_REROUTE_DELAY_MS &&
          !automaticRerouteStartedRef.current &&
          !guidancePausedRef.current
        ) {
          automaticRerouteStartedRef.current = true
          executeReroute(nextFrame, "automatic")
        }

        const spokenInstruction =
          nextFrame.status === "navigating" ? nextFrame.instruction : null
        speakInstruction(nextFrame, spokenInstruction)
      },
      onError: (error) => {
        if (!disposed) {
          setGpsState("error")
          setGpsMessage(error.message || "GPS unavailable")
          dispatch({
            type: "reportError",
            error:
              error.code === 1
                ? { kind: "denied" }
                : { kind: "unknown", message: error.message || "GPS error" }
          })
        }
      }
    }).then((session) => {
      if (disposed) void session.stop()
      else sessionRef.current = session
    }).catch(() => {
      if (!disposed) {
        setGpsState("error")
        setGpsMessage("Location permission needed")
        dispatch({ type: "reportError", error: { kind: "denied" } })
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
      dispatch({ type: "reset" })
    }
  }, [initialFrame, navigationModel, route, sessionAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    viewModel,
    gpsState,
    gpsMessage,
    rerouteStatus,
    rejoinPolicy,
    rideAlert,
    voiceEnabled,
    guidancePaused,
    recording,
    location,
    toggleVoice,
    toggleGuidancePause,
    pauseForOvernightStop,
    retryGps,
    toggleRecording,
    exitRide,
    dismissRideAlert,
    requestRejoin,
    selectFuelStop
  }
}
