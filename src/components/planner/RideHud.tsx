"use client"

import {
  ArrowClockwise,
  Bookmarks,
  GpsFix,
  GpsSlash,
  LockSimple,
  NavigationArrow,
  Pause,
  Play,
  SpinnerGap,
  SpeakerHigh,
  SpeakerSlash,
  WarningCircle,
  X
} from "@phosphor-icons/react"
import { useEffect, useMemo } from "react"
import { maneuverKind } from "@/lib/client/maneuver"
import { computeRouteDataQuality } from "@/lib/roads/route-data-quality"
import { usePlannerStore } from "@/stores/planner-store"
import { ManeuverGlyph } from "./maneuver-glyph"
import { RideHudStatus } from "./RideHudStatus"
import { RideRecoveryActions } from "./RideRecoveryActions"
import { RideWeatherAlert } from "./RideWeatherAlert"
import { useRideFuelDetour } from "./useRideFuelDetour"
import {
  useNavigationSessionController,
  instructionDistance,
  type NavigationSessionControllerInput
} from "./useNavigationSessionController"

export function RideHud(input: NavigationSessionControllerInput) {
  const controller = useNavigationSessionController(input)
  const { commands } = controller
  const { fuelStops, findFuel: findFuelStops, selectFuelStop: chooseFuelStop } = useRideFuelDetour({
    routeId: input.route.id,
    onChooseFuelStop(_frame, fuelStop) {
      commands.selectFuelStop(fuelStop)
    }
  })

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

  const frame = controller.viewModel.frame
  const route = input.route
  const trackGuidance = controller.trackGuidance
  const guidanceReady =
    controller.gpsState === "ready" && controller.location !== null
  const instruction =
    trackGuidance
      ? null
      : guidanceReady && frame ? (frame.instruction ?? route.instructions[0]) : route.instructions[0]
  const offRoute = guidanceReady && frame?.status === "off-route"
  const deviating = guidanceReady && frame?.status === "deviating"
  const arrived = guidanceReady && frame?.status === "arrived"
  const matchAmbiguous = guidanceReady && frame?.status === "uncertain"
  const progressReady = guidanceReady && !matchAmbiguous && (trackGuidance || (!offRoute && !deviating))
  const displayFrame = progressReady ? frame : null
  const currentInstruction = guidanceReady && frame ? frame.instruction : null
  const currentSpeedLimit = currentInstruction?.speedLimitKmh ?? null
  const roadLocks = usePlannerStore((state) => state.roadLocks)
  const bikeProfile = usePlannerStore((state) => state.bikeProfile)
  const routeDataQuality = useMemo(
    () => computeRouteDataQuality({ route }),
    [route]
  )

  const satisfiedMustLock = useMemo(() => {
    const satisfactions = route.lockSatisfaction ?? []
    return satisfactions
      .filter((row) => row.mode === "must" && row.satisfied)
      .map((row) => {
        const lock = roadLocks.find((entry) => entry.id === row.lockId)
        return {
          lockId: row.lockId,
          displayName: lock?.displayName?.trim() || lock?.sourceRegionId || "Locked corridor"
        }
      })
  }, [route.lockSatisfaction, roadLocks])

  const inMustCorridor = progressReady && satisfiedMustLock.length > 0
  const exitedCorridorUnexpectedly = offRoute && satisfiedMustLock.length > 0

  const lockedCorridorLabel = satisfiedMustLock[0]?.displayName ?? null

  const headerLabel = controller.guidancePaused
    ? "Guidance paused"
    : arrived
      ? "Arrived"
      : matchAmbiguous
        ? "Guidance paused"
        : trackGuidance
          ? "Track guidance"
        : deviating
          ? "Checking position"
          : guidanceReady
            ? "Live guidance"
            : "Route preview"

  const instructionEyebrow = arrived
      ? "Destination"
      : trackGuidance
        ? offRoute ? "Track guidance · off track" : "Track guidance"
        : offRoute
          ? "Off route"
      : deviating
        ? "Verifying position"
        : matchAmbiguous
          ? "Position uncertain"
          : guidanceReady && frame
            ? `Next instruction · ${instructionDistance(frame.distanceToInstructionMeters)}`
            : "Guidance paused"

  const instructionHeading = controller.guidancePaused
    ? "Guidance paused"
    : arrived
        ? "You have arrived"
        : trackGuidance
          ? offRoute
            ? "Return to the highlighted track"
            : guidanceReady
              ? "Follow the GPX track"
              : "GPS fix required"
          : offRoute
            ? controller.rerouteStatus === "routing"
              ? "Finding a safe way back…"
              : "Return to the highlighted route"
            : deviating
          ? "Checking your route position"
          : matchAmbiguous
            ? "Route match unclear"
            : guidanceReady
              ? instruction?.text ?? "Follow the highlighted route"
              : "GPS fix required"

  const instructionDetail = controller.guidancePaused
    ? "Resume when you are ready for route cues and automatic recovery."
    : arrived
        ? route.waypoints.at(-1)?.label || "Destination reached"
        : trackGuidance
          ? offRoute
            ? `Track guidance — road data unavailable. ${frame ? Math.round(frame.distanceFromRouteMeters) : "—"} m off track; no automatic reroute.`
            : "Track guidance — road data unavailable. Follow the breadcrumb and direction arrow; no turn instructions are invented."
          : offRoute
            ? controller.rerouteStatus === "routing"
              ? "Switchback is rebuilding the line from your current location."
              : controller.rerouteStatus === "error"
                ? "The requested rejoin route failed. Stop safely before trying again."
                : controller.rejoinPolicy === "preserve-original"
                  ? "Your original route is preserved. Choose a rejoin point when it is safe."
                  : "Choose a recovery option, or keep moving and Switchback will recalculate automatically."
            : deviating
          ? "GPS is outside the route corridor. Guidance will only reroute if the deviation continues."
          : matchAmbiguous
            ? "Guidance is paused until your direction and route position can be matched."
            : guidanceReady && instruction
              ? instruction.streetName || "Stay on route"
              : controller.gpsMessage

  return (
    <section
      className={`ride-hud gps-${controller.gpsState}${offRoute ? " is-off-route" : ""}${deviating ? " is-deviating" : ""}${arrived ? " is-arrived" : ""}${matchAmbiguous ? " is-match-ambiguous" : ""}${trackGuidance ? " is-track-guidance" : ""}`}
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
          <GpsFix aria-hidden="true" />{" "}
          {controller.gpsState === "error"
            ? "GPS unavailable"
            : controller.gpsMessage}
        </div>
        <button
          type="button"
          className="ride-voice-toggle"
          aria-label={
            controller.voiceEnabled
              ? "Mute voice guidance"
              : "Enable voice guidance"
          }
          aria-pressed={controller.voiceEnabled}
          onClick={commands.toggleVoice}
        >
          {controller.voiceEnabled ? (
            <SpeakerHigh aria-hidden="true" />
          ) : (
            <SpeakerSlash aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="ride-guidance-toggle"
          aria-label={
            controller.guidancePaused
              ? "Resume guidance"
              : "Pause guidance"
          }
          aria-pressed={controller.guidancePaused}
          onClick={commands.toggleGuidancePause}
        >
          {controller.guidancePaused ? (
            <Play aria-hidden="true" />
          ) : (
            <Pause aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="ride-overnight-stop"
          aria-label="Pause for overnight stop"
          disabled={controller.guidancePaused}
          onClick={commands.pauseForOvernightStop}
        >
          <Bookmarks aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`ride-record-toggle${controller.recording ? " is-recording" : ""}`}
          aria-label={
            controller.recording
              ? "Stop ride recording"
              : "Start ride recording"
          }
          aria-pressed={controller.recording}
          onClick={commands.toggleRecording}
        >
          {controller.recording ? "REC" : "Record"}
        </button>
        <button
          type="button"
          className="ride-exit"
          aria-label="Exit ride mode"
          onClick={commands.exitRide}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      {controller.rideAlert ? (
        <RideWeatherAlert
          alert={controller.rideAlert}
          onDismiss={commands.dismissRideAlert}
        />
      ) : null}

      <div className="ride-instruction">
        <div className="maneuver-icon" aria-hidden="true">
          {trackGuidance ? (
            guidanceReady ? (
              <NavigationArrow
                weight="fill"
                aria-label="Track direction"
                style={{ transform: `rotate(${frame?.routeBearingDegrees ?? frame?.headingDegrees ?? 0}deg)` }}
              />
            ) : (
              <GpsSlash weight="bold" />
            )
          ) : guidanceReady && !matchAmbiguous ? (
            arrived ? (
              <ManeuverGlyph kind="finish" />
            ) : controller.rerouteStatus === "routing" ? (
              <SpinnerGap className="spin" />
            ) : (
              <ManeuverGlyph
                kind={maneuverKind(instruction?.sign ?? 0)}
              />
            )
          ) : (
            <GpsSlash weight="bold" />
          )}
        </div>
        <div role="status" aria-live="polite">
          <RideHudStatus
            eyebrow={instructionEyebrow}
            heading={instructionHeading}
            detail={instructionDetail}
            bikeProfileLabel={bikeProfile.name}
            headlinePercent={routeDataQuality.headlinePercent}
          />
          {inMustCorridor && lockedCorridorLabel ? (
            <div className="ride-hud-corridor-badge" role="status" aria-live="polite">
              <LockSimple weight="fill" aria-hidden="true" />
              <span>
                <small>On locked corridor</small>
                <strong>{lockedCorridorLabel}</strong>
              </span>
            </div>
          ) : null}
          {exitedCorridorUnexpectedly && !trackGuidance ? (
            <div className="ride-hud-corridor-exit-alert" role="alert">
              <WarningCircle weight="fill" aria-hidden="true" />
              <span>
                <strong>Off-route from locked corridor</strong>
                <small>{lockedCorridorLabel ?? "Locked corridor"} was exited unexpectedly. Switchback is rebuilding the line from your current location.</small>
              </span>
            </div>
          ) : null}
          {!trackGuidance && guidanceReady &&
          !offRoute &&
          !deviating &&
          !arrived &&
          frame &&
          ["straight", "continue", "depart"].includes(
            maneuverKind(instruction?.sign ?? 0)
          ) &&
          frame.distanceToInstructionMeters > 800 &&
          instruction?.streetName ? (
            <small className="ride-continue-cue">
              Continue on {instruction.streetName} for{" "}
              {(frame.distanceToInstructionMeters / 1609.344).toFixed(1)} mi
            </small>
          ) : null}
          {!trackGuidance && guidanceReady &&
          !offRoute &&
          !deviating &&
          !arrived &&
          frame?.thenInstruction &&
          frame.distanceToInstructionMeters <= 300 ? (
            <small className="ride-then-cue">
              Then {frame.thenInstruction.text.toLowerCase()}
              {frame.thenInstruction.streetName
                ? ` onto ${frame.thenInstruction.streetName}`
                : ""}
            </small>
          ) : null}
          {offRoute && !trackGuidance ? (
            <div
              className="ride-reroute-card"
              role="group"
              aria-label="Choose a route rejoin option"
            >
              <RideRecoveryActions
                rerouteStatus={controller.rerouteStatus}
                rejoinPolicy={controller.rejoinPolicy}
                fuelStops={fuelStops}
                onRequestRejoin={commands.requestRejoin}
                onFindFuel={() => {
                  const activeFrame = frame
                  if (activeFrame) findFuelStops(activeFrame)
                }}
                onSelectFuelStop={(fuelStop) => {
                  const activeFrame = frame
                  if (activeFrame) chooseFuelStop(activeFrame, fuelStop)
                }}
              />
            </div>
          ) : null}
          {controller.gpsState === "error" &&
          window.isSecureContext !== false ? (
            <button
              type="button"
              className="gps-retry-button"
              onClick={commands.retryGps}
            >
              <ArrowClockwise aria-hidden="true" />
              Try GPS again
            </button>
          ) : null}
        </div>
      </div>

      <footer className="ride-telemetry">
        <div>
          <strong>
            {guidanceReady && displayFrame
              ? (displayFrame.remainingDistanceMeters / 1609.344).toFixed(1)
              : route.distanceMiles.toFixed(1)}
          </strong>
          <span>
            {guidanceReady ? "miles left" : "planned miles"}
          </span>
        </div>
        <div>
          <strong>
            {Math.max(
              0,
              Math.round(
                guidanceReady && displayFrame
                  ? displayFrame.remainingDurationSeconds / 60
                  : route.durationMinutes
              )
            )}
          </strong>
          <span>{guidanceReady ? "minutes" : "planned min"}</span>
        </div>
        <div className="ride-speed-badge" aria-live="off">
          <strong>
            {guidanceReady && displayFrame?.speedMetersPerSecond != null
              ? Math.round(displayFrame.speedMetersPerSecond * 2.237)
              : 0}
          </strong>
          <span>mph</span>
        </div>
        {currentSpeedLimit != null ? (
          <div
            className="ride-speed-limit"
            aria-label={`Speed limit ${Math.round(currentSpeedLimit * 0.621371)} miles per hour`}
          >
            <span className="ride-speed-limit-value">
              {Math.round(currentSpeedLimit * 0.621371)}
            </span>
          </div>
        ) : null}
        <div
          className="ride-progress-readout"
          role="status"
          aria-label={`${guidanceReady && displayFrame ? Math.round(displayFrame.routePercent) : 0} percent complete`}
        >
          <strong>
            {guidanceReady && displayFrame
              ? Math.round(displayFrame.routePercent)
              : 0}
            %
          </strong>
          <span>
            {arrived
              ? "ride complete"
              : trackGuidance
                ? arrived ? "track complete" : guidanceReady ? "track progress" : "waiting for GPS"
              : matchAmbiguous
                ? "route match pending"
                : guidanceReady
                  ? "route progress"
                  : "waiting for GPS"}
          </span>
        </div>
        <div className="ride-progress-track" aria-hidden="true">
          <span
            style={{
              width: `${guidanceReady && displayFrame ? displayFrame.routePercent : 0}%`
            }}
          />
        </div>
      </footer>
    </section>
  )
}
