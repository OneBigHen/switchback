import type { Map as MapLibreMap } from "maplibre-gl"
import type { ExplorationSegment, ReconTrack, ReplayFrame } from "@/features/recon/types"
import type { CinematicPlan } from "@/features/recon/cinematic/shot-plan"
import { ReconCameraDirector, chordBearing, modeTarget, type CameraPose, type ReconCameraMode } from "./camera-director"
import { displayPath, pointAtFraction, progressAtDistance, replayTimeline, sampleReplay, type DisplayPath } from "./replay-timeline"
import type { ReplayOverlay } from "./replay-overlay"

/**
 * The Replay engine: one requestAnimationFrame loop that owns playback time,
 * the camera director (or the cinematic plan), the deck.gl overlay and the
 * live readouts. Nothing here flows through React at frame rate — the UI
 * subscribes with `onFrame` and writes to its own DOM nodes, and only rare
 * state changes (play/pause, mode, follow suspended) are emitted as events.
 */

/** Preview flyovers move at a nominal 50 mph so rates mean the same thing. */
const PREVIEW_NOMINAL_MPS = 22.35

export const REPLAY_RATES = [10, 30, 60, 120, 300] as const
export type ReplayRate = (typeof REPLAY_RATES)[number]

export interface EngineFrame {
  frame: ReplayFrame
  /** Rider position as a fraction of track distance. */
  fraction: number
  playing: boolean
  /** Film time and length while Cinematic runs; null otherwise. */
  cinematic: { seconds: number; totalSeconds: number; shot: string } | null
}

export interface EngineState {
  playing: boolean
  rate: ReplayRate
  mode: ReconCameraMode
  following: boolean
  cinematic: boolean
  finished: boolean
}

type FrameListener = (frame: EngineFrame) => void
type StateListener = (state: EngineState) => void

/** The rate whose replay lasts closest to ~90 seconds. */
export function defaultRate(track: ReconTrack): ReplayRate {
  const durationMs = playbackDurationMs(track)
  if (!durationMs) return 60
  const target = 90_000
  return REPLAY_RATES.reduce((best, rate) => (Math.abs(durationMs / rate - target) < Math.abs(durationMs / best - target) ? rate : best))
}

/** Real (recorded) or nominal (preview) duration at 1× speed. */
export function playbackDurationMs(track: ReconTrack): number | null {
  const timeline = replayTimeline(track)
  if (!timeline) return null
  return timeline.totalDurationMs ?? (timeline.totalDistanceMeters / PREVIEW_NOMINAL_MPS) * 1000
}

export class ReplayEngine {
  private readonly path: DisplayPath
  private readonly durationMs: number
  private readonly director: ReconCameraDirector
  private readonly vertexMeters: number[]
  private position = 0
  private playing = false
  private rate: ReplayRate
  private plan: CinematicPlan | null = null
  private cinematicSeconds = 0
  private finished = false
  private raf = 0
  private lastNow: number | null = null
  private dirty = true
  private disposed = false
  private readonly frameListeners = new Set<FrameListener>()
  private readonly stateListeners = new Set<StateListener>()
  private readonly detachInteraction: () => void

  constructor(
    private readonly map: MapLibreMap,
    private readonly track: ReconTrack,
    private readonly overlay: ReplayOverlay | null,
    private segments: readonly ExplorationSegment[] | null,
    private reducedMotion: boolean,
    initialMode: ReconCameraMode
  ) {
    const path = displayPath(track)
    const durationMs = playbackDurationMs(track)
    if (!path || !durationMs) throw new Error("Track cannot be replayed")
    this.path = path
    this.durationMs = durationMs
    this.rate = defaultRate(track)
    this.director = new ReconCameraDirector(initialMode, reducedMotion, this.viewportPx())
    // Display vertices map to original-track meters by fraction of length.
    const scale = track.distanceMeters / Math.max(1, path.totalDistanceMeters)
    this.vertexMeters = path.distancesMeters.map((meters) => meters * scale)
    this.detachInteraction = this.watchManualCamera()
    // Open on the whole ride, then let the director dive into its mode.
    if (!reducedMotion) {
      const opening = modeTarget("overview", { path, fraction: 0, groundSpeedMps: 0 }, this.viewportPx(), 0, map.getBearing())
      this.applyPose({ ...opening, zoom: opening.zoom - 1.2, pitch: 45 })
      this.director.resume(this.currentPose())
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  get trackId(): string {
    return this.track.id
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener)
    this.dirty = true
    return () => this.frameListeners.delete(listener)
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.state())
    return () => this.stateListeners.delete(listener)
  }

  state(): EngineState {
    return {
      playing: this.playing,
      rate: this.rate,
      mode: this.director.mode,
      following: this.director.isFollowing,
      cinematic: this.plan !== null,
      finished: this.finished
    }
  }

  play(): void {
    if (this.plan) {
      if (this.cinematicSeconds >= this.plan.totalSeconds) this.cinematicSeconds = 0
    } else if (this.position >= 1) {
      this.position = 0
      this.director.jumped()
    }
    this.playing = true
    this.finished = false
    this.emitState()
  }

  pause(): void {
    this.playing = false
    this.emitState()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  setRate(rate: ReplayRate): void {
    this.rate = rate
    this.emitState()
  }

  setMode(mode: ReconCameraMode): void {
    this.director.setMode(mode)
    this.dirty = true
    this.emitState()
  }

  resumeFollow(): void {
    this.director.resume(this.currentPose())
    this.dirty = true
    this.emitState()
  }

  setSegments(segments: readonly ExplorationSegment[] | null): void {
    this.segments = segments
    this.dirty = true
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion
    this.director.setReducedMotion(reducedMotion)
  }

  /** Jump to playback progress (time for rides, distance for previews). */
  seek(position: number): void {
    this.position = Math.min(1, Math.max(0, position))
    this.finished = false
    this.director.jumped()
    this.dirty = true
  }

  seekDistance(meters: number): void {
    this.seek(progressAtDistance(this.track, meters))
  }

  step(seconds: number): void {
    this.seek(this.position + (seconds * 1000 * this.rate) / this.durationMs)
  }

  /** Start the authored film from the beginning. */
  startCinematic(plan: CinematicPlan): void {
    this.plan = plan
    this.cinematicSeconds = 0
    this.finished = false
    this.playing = !this.reducedMotion
    this.director.jumped()
    this.dirty = true
    this.emitState()
  }

  /** Leave the film at the exact ride position it had reached. */
  exitCinematic(): void {
    if (!this.plan) return
    this.position = progressAtDistance(this.track, this.plan.fractionAt(this.cinematicSeconds) * this.track.distanceMeters)
    this.plan = null
    this.playing = false
    this.director.resume(this.currentPose())
    this.dirty = true
    this.emitState()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.detachInteraction()
    this.frameListeners.clear()
    this.stateListeners.clear()
    this.overlay?.dispose()
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) return
    const dtMs = this.lastNow === null ? 16 : Math.min(250, now - this.lastNow)
    this.lastNow = now
    this.advance(dtMs)
    this.raf = requestAnimationFrame(this.tick)
  }

  private advance(dtMs: number): void {
    let fraction: number
    let groundSpeedMps: number
    let cinematic: EngineFrame["cinematic"] = null

    if (this.plan) {
      if (this.playing) this.cinematicSeconds += dtMs / 1000
      if (this.cinematicSeconds >= this.plan.totalSeconds) {
        this.cinematicSeconds = this.plan.totalSeconds
        if (this.playing) this.finish()
      }
      fraction = this.plan.fractionAt(this.cinematicSeconds)
      this.position = progressAtDistance(this.track, fraction * this.track.distanceMeters)
      groundSpeedMps = this.plan.groundSpeedAt(this.cinematicSeconds)
      cinematic = { seconds: this.cinematicSeconds, totalSeconds: this.plan.totalSeconds, shot: this.plan.shotAt(this.cinematicSeconds).kind }
    } else {
      const orbiting = this.director.mode === "orbit" && this.director.isFollowing
      const blending = this.blending()
      if (!this.playing && !this.dirty && !orbiting && !blending) return
      if (this.playing) {
        this.position += (dtMs * this.rate) / this.durationMs
        if (this.position >= 1) {
          this.position = 1
          this.finish()
        }
      }
      fraction = 0
      groundSpeedMps = 0
    }

    const frame = sampleReplay(this.track, this.position)
    if (!frame) return
    if (!this.plan) {
      fraction = frame.distanceMeters / Math.max(1, this.track.distanceMeters)
      // Frame for the playback speed even while paused, so pausing never
      // slams the chase camera down onto the road.
      groundSpeedMps = (this.track.distanceMeters / this.durationMs) * 1000 * this.rate
    }

    const head = pointAtFraction(this.path, fraction)
    const pose = this.plan
      ? this.plan.poseAt(this.cinematicSeconds, this.viewportPx(), this.reducedMotion)
      : this.director.update({ path: this.path, fraction, groundSpeedMps, playing: this.playing, dtMs })
    if (pose) this.applyPose(pose)

    this.overlay?.update({
      path: this.path,
      cutIndex: head.index,
      head: head.coordinate,
      // A short path chord points the beacon down the road without GPS wobble.
      bearing: chordBearing(this.path, fraction, 25, 60) ?? frame.bearingDegrees,
      vertexMeters: this.vertexMeters,
      segments: this.segments,
      playbackKind: this.track.playbackKind,
      nowMs: performance.now(),
      reducedMotion: this.reducedMotion
    })

    const engineFrame: EngineFrame = { frame, fraction, playing: this.playing, cinematic }
    for (const listener of this.frameListeners) listener(engineFrame)
    this.dirty = false
  }

  private blendRemaining = 0

  private blending(): boolean {
    // The director eases for ~1.1 s after a mode change or jump; keep
    // drawing while it does even if playback is paused.
    if (this.dirty) this.blendRemaining = 90
    else if (this.blendRemaining > 0) this.blendRemaining -= 1
    return this.blendRemaining > 0
  }

  private finish(): void {
    this.playing = false
    this.finished = true
    this.emitState()
  }

  private applyPose(pose: CameraPose): void {
    this.suppressInteraction = true
    this.map.jumpTo({ center: pose.center, zoom: pose.zoom, bearing: pose.bearing, pitch: Math.min(pose.pitch, this.map.getMaxPitch()) })
    this.suppressInteraction = false
  }

  private currentPose(): CameraPose {
    const center = this.map.getCenter()
    return { center: [center.lng, center.lat], zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() }
  }

  private viewportPx(): number {
    const canvas = this.map.getCanvas()
    return Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight * 1.4))
  }

  private suppressInteraction = false

  /** A real drag, wheel, rotate or pitch hands the camera to the rider. */
  private watchManualCamera(): () => void {
    const events = ["dragstart", "rotatestart", "pitchstart", "wheel"] as const
    const onManual = (event: { originalEvent?: unknown }) => {
      if (this.suppressInteraction || !event.originalEvent || this.plan) return
      if (!this.director.isFollowing) return
      this.director.suspend()
      this.emitState()
    }
    for (const name of events) this.map.on(name, onManual)
    const onResize = () => this.director.setViewport(this.viewportPx())
    this.map.on("resize", onResize)
    return () => {
      for (const name of events) this.map.off(name, onManual)
      this.map.off("resize", onResize)
    }
  }

  private emitState(): void {
    this.dirty = true
    const state = this.state()
    for (const listener of this.stateListeners) listener(state)
  }
}
