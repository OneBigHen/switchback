import { analyzeGeometry } from "@/lib/routing/scoring"
import type { Coordinate } from "@/lib/routing/types"
import type { ExplorationSegment, ReconTrack } from "@/features/recon/types"
import { cumulativeDistancesMeters } from "@/features/recon/data/recon-track"
import { replayTimeline, simplifyByTolerance } from "@/features/recon/replay/replay-timeline"
import { EXPLORATION_SAMPLE_METERS, resampleAlong } from "./exploration"

/**
 * X-Ray: a synchronized, factual breakdown of one ride, binned by distance so
 * every strip shares one axis with the replay head.
 *
 * Every value comes from the ride's own observations or an existing
 * OpenGravel computation: curvature is `analyzeGeometry` (the planner's own
 * twistiness formula) over a sliding window; surface is Gravel Atlas
 * corridors that actually run along the ride. Anything not observed is null
 * and renders as a deliberate "unknown", never a zero.
 */

export const XRAY_BIN_COUNT = 180
const CURVATURE_WINDOW_METERS = 800
/** GPS wander below this is noise, not a bend in the road. */
const GPS_SIMPLIFY_METERS = 8
const GAP_DISTANCE_METERS = 250
const GAP_TIME_MS = 45_000
const LOW_ACCURACY_METERS = 25
const MOVING_MPH = 3
const PLAN_TOLERANCE_METERS = 60
const EVIDENCE_TOLERANCE_METERS = 30
const MPS_TO_MPH = 2.236936

export type CurvatureBand = "calm" | "mellow" | "twisty" | "hairpin"

/** Mirrors `curvatureBand` in src/lib/gpx/atlas.ts (a server-only module). */
export function curvatureBandFor(twistiness: number): CurvatureBand {
  if (twistiness >= 65) return "hairpin"
  if (twistiness >= 45) return "twisty"
  if (twistiness >= 22) return "mellow"
  return "calm"
}

export interface XRayBin {
  fromMeters: number
  toMeters: number
  altitudeMeters: number | null
  speedMph: number | null
  twistiness: number | null
  /** True only when a Gravel Atlas corridor runs along this stretch. */
  knownGravel: boolean
  lowAccuracy: boolean
}

export interface XRayGap {
  atMeters: number
  lengthMeters: number
  seconds: number | null
}

export interface XRayMoment {
  id: string
  caption: string
  atMeters: number
}

export interface XRaySummary {
  distanceMeters: number
  durationMinutes: number | null
  movingMinutes: number | null
  averageMovingMph: number | null
  maxSpeedMph: number | null
  /** Where the speed figures come from, so the UI can say so. */
  speedSource: "device" | "timestamps" | null
  ascentMeters: number | null
  descentMeters: number | null
  twistiness: number | null
  onPlanPercent: number | null
  gapCount: number
  knownGravelMeters: number | null
}

export interface XRayReport {
  bins: XRayBin[]
  gaps: XRayGap[]
  moments: XRayMoment[]
  summary: XRaySummary
  altitudeRange: [number, number] | null
  speedMax: number | null
}

export type EvidenceLines = ReadonlyArray<ReadonlyArray<Coordinate>>

export function buildXRay(track: ReconTrack, evidence: EvidenceLines | null): XRayReport | null {
  const timeline = replayTimeline(track)
  if (!timeline) return null
  const coordinates = track.geometry.coordinates
  const distances = timeline.distancesMeters
  const total = timeline.totalDistanceMeters
  const binLength = total / XRAY_BIN_COUNT
  const recorded = track.playbackKind === "recorded"

  const speeds = pointSpeeds(track, timeline.timesMs, distances)
  const bins: XRayBin[] = Array.from({ length: XRAY_BIN_COUNT }, (_, index) => ({
    fromMeters: index * binLength,
    toMeters: (index + 1) * binLength,
    altitudeMeters: null,
    speedMph: null,
    twistiness: null,
    knownGravel: false,
    lowAccuracy: false
  }))

  // Per-bin averages over the points that fall inside each bin.
  const altitudeSum = new Float64Array(XRAY_BIN_COUNT)
  const altitudeCount = new Uint32Array(XRAY_BIN_COUNT)
  const speedSum = new Float64Array(XRAY_BIN_COUNT)
  const speedCount = new Uint32Array(XRAY_BIN_COUNT)
  const accuracyBad = new Uint32Array(XRAY_BIN_COUNT)
  const accuracyCount = new Uint32Array(XRAY_BIN_COUNT)
  track.points.forEach((point, index) => {
    const bin = Math.min(XRAY_BIN_COUNT - 1, Math.floor(distances[index]! / binLength))
    if (point.altitudeMeters !== null) {
      altitudeSum[bin] += point.altitudeMeters
      altitudeCount[bin] += 1
    }
    const speed = speeds.values[index]
    if (speed !== null && speed !== undefined) {
      speedSum[bin] += speed
      speedCount[bin] += 1
    }
    if (point.accuracyMeters !== null) {
      accuracyCount[bin] += 1
      if (point.accuracyMeters > LOW_ACCURACY_METERS) accuracyBad[bin] += 1
    }
  })

  // Curvature reads the road's shape, so recorded GPS is simplified first.
  const shape = recorded ? simplifyByTolerance(coordinates, GPS_SIMPLIFY_METERS) : coordinates
  const windowSamples = resampleAlong(shape, 20)
  const windowDistances = cumulativeDistancesMeters(windowSamples)
  const evidenceIndex = evidence && evidence.length > 0 ? new SegmentIndex(evidence, EVIDENCE_TOLERANCE_METERS) : null
  let knownGravelMeters = 0

  bins.forEach((bin, index) => {
    if (altitudeCount[index]! > 0) bin.altitudeMeters = altitudeSum[index]! / altitudeCount[index]!
    if (speedCount[index]! > 0) bin.speedMph = speedSum[index]! / speedCount[index]!
    bin.lowAccuracy = accuracyCount[index]! > 0 && accuracyBad[index]! / accuracyCount[index]! > 0.5

    const middle = (bin.fromMeters + bin.toMeters) / 2
    const window = sliceByDistance(windowSamples, windowDistances, middle - CURVATURE_WINDOW_METERS / 2, middle + CURVATURE_WINDOW_METERS / 2)
    if (window.length >= 3) bin.twistiness = analyzeGeometry(window).twistiness

    if (evidenceIndex) {
      const probes = sliceByDistance(windowSamples, windowDistances, bin.fromMeters, bin.toMeters)
      const near = probes.filter((probe) => evidenceIndex.near(probe)).length
      bin.knownGravel = probes.length > 0 && near / probes.length >= 0.5
      if (bin.knownGravel) knownGravelMeters += bin.toMeters - bin.fromMeters
    }
  })
  fillAltitudeGaps(bins)

  const altitudes = bins.map((bin) => bin.altitudeMeters).filter((value): value is number => value !== null)
  const binSpeeds = bins.map((bin) => bin.speedMph).filter((value): value is number => value !== null)

  const gaps = findGaps(track, recorded ? timeline.timesMs : null, distances)
  return {
    bins,
    gaps,
    moments: track.moments.map((moment) => ({
      id: moment.id,
      caption: moment.caption,
      atMeters: distanceAtTime(timeline.timesMs, distances, moment.at - (track.startedAt ?? 0))
    })),
    summary: {
      distanceMeters: total,
      durationMinutes: track.facts.durationMinutes,
      ...movingFacts(track, timeline.timesMs, distances, speeds),
      speedSource: speeds.source,
      ascentMeters: track.facts.ascentMeters,
      descentMeters: track.facts.descentMeters,
      twistiness: shape.length >= 3 ? analyzeGeometry(shape).twistiness : null,
      onPlanPercent: track.plannedGeometry ? shareNear(coordinates, track.plannedGeometry, PLAN_TOLERANCE_METERS) : null,
      gapCount: gaps.length,
      knownGravelMeters: evidenceIndex ? knownGravelMeters : null
    },
    altitudeRange: altitudes.length > 0 ? [Math.min(...altitudes), Math.max(...altitudes)] : null,
    speedMax: binSpeeds.length > 0 ? Math.max(...binSpeeds) : null
  }
}

/** Device speed where the ride has it; otherwise speed from GPS time and distance. */
function pointSpeeds(
  track: ReconTrack,
  timesMs: readonly number[],
  distances: readonly number[]
): { values: Array<number | null>; source: XRaySummary["speedSource"] } {
  if (track.playbackKind !== "recorded") return { values: track.points.map(() => null), source: null }
  const device = track.points.map((point) => point.speedMph)
  if (device.filter((value) => value !== null).length >= track.points.length * 0.5) return { values: device, source: "device" }
  const derived = track.points.map((_, index) => {
    const from = Math.max(0, index - 2)
    const to = Math.min(track.points.length - 1, index + 2)
    const seconds = (timesMs[to]! - timesMs[from]!) / 1000
    if (seconds <= 0) return null
    const meters = distances[to]! - distances[from]!
    // A jump across a signal gap is not a speed anyone rode.
    if (meters > GAP_DISTANCE_METERS * 2) return null
    return (meters / seconds) * MPS_TO_MPH
  })
  return { values: derived, source: "timestamps" }
}

function movingFacts(
  track: ReconTrack,
  timesMs: readonly number[],
  distances: readonly number[],
  speeds: { values: Array<number | null> }
): Pick<XRaySummary, "movingMinutes" | "averageMovingMph" | "maxSpeedMph"> {
  if (track.playbackKind !== "recorded") return { movingMinutes: null, averageMovingMph: null, maxSpeedMph: null }
  let movingMs = 0
  let movingMeters = 0
  for (let index = 1; index < track.points.length; index += 1) {
    const ms = timesMs[index]! - timesMs[index - 1]!
    const meters = distances[index]! - distances[index - 1]!
    if (ms <= 0 || ms > GAP_TIME_MS * 4) continue
    if ((meters / (ms / 1000)) * MPS_TO_MPH >= MOVING_MPH) {
      movingMs += ms
      movingMeters += meters
    }
  }
  const observed = speeds.values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  // The 98th percentile, so one bad fix cannot claim a top speed.
  const maxSpeedMph = observed.length > 0 ? observed[Math.floor((observed.length - 1) * 0.98)]! : null
  return {
    movingMinutes: movingMs > 0 ? movingMs / 60_000 : null,
    averageMovingMph: movingMs > 0 ? (movingMeters / (movingMs / 1000)) * MPS_TO_MPH : null,
    maxSpeedMph
  }
}

function findGaps(track: ReconTrack, timesMs: readonly number[] | null, distances: readonly number[]): XRayGap[] {
  const gaps: XRayGap[] = []
  for (let index = 1; index < track.points.length; index += 1) {
    const meters = distances[index]! - distances[index - 1]!
    const ms = timesMs ? timesMs[index]! - timesMs[index - 1]! : null
    const teleport = meters > GAP_DISTANCE_METERS
    const silence = ms !== null && ms > GAP_TIME_MS && meters > 30
    if (teleport || silence) {
      gaps.push({ atMeters: distances[index - 1]!, lengthMeters: meters, seconds: ms === null ? null : Math.round(ms / 1000) })
    }
  }
  return gaps
}

function distanceAtTime(timesMs: readonly number[], distances: readonly number[], elapsedMs: number): number {
  if (timesMs.length === 0) return 0
  let index = 0
  while (index < timesMs.length - 2 && timesMs[index + 1]! <= elapsedMs) index += 1
  const span = timesMs[index + 1]! - timesMs[index]!
  const t = span > 0 ? Math.min(1, Math.max(0, (elapsedMs - timesMs[index]!) / span)) : 0
  return distances[index]! + (distances[index + 1]! - distances[index]!) * t
}

function sliceByDistance(samples: readonly Coordinate[], distances: readonly number[], from: number, to: number): Coordinate[] {
  const result: Coordinate[] = []
  for (let index = 0; index < samples.length; index += 1) {
    const at = distances[index]!
    if (at < from) continue
    if (at > to) break
    result.push(samples[index]!)
  }
  return result
}

/** Short altitude holes (one or two empty bins) are bridged for drawing only. */
function fillAltitudeGaps(bins: XRayBin[]): void {
  for (let index = 1; index < bins.length - 1; index += 1) {
    if (bins[index]!.altitudeMeters !== null) continue
    const before = bins[index - 1]!.altitudeMeters
    const after = bins[index + 1]?.altitudeMeters ?? bins[index + 2]?.altitudeMeters ?? null
    if (before !== null && after !== null) bins[index]!.altitudeMeters = (before + after) / 2
  }
}

const METERS_PER_DEGREE = 111_320

/** Grid of line segments for "is this point within N meters of any line". */
class SegmentIndex {
  private readonly cells = new Map<string, Array<[Coordinate, Coordinate]>>()
  private readonly lngScale: number
  private readonly cellLat: number
  private readonly cellLng: number

  constructor(lines: EvidenceLines, private readonly tolerance: number) {
    const latitude = lines[0]?.[0]?.[1] ?? 40
    this.lngScale = METERS_PER_DEGREE * Math.max(0.05, Math.cos((latitude * Math.PI) / 180))
    this.cellLat = Math.max(tolerance, 200) / METERS_PER_DEGREE
    this.cellLng = Math.max(tolerance, 200) / this.lngScale
    // Register each segment in the cells it passes through, sampled at half a
    // cell so no crossed cell is missed; lookups search the 3×3 neighbourhood.
    const cellMeters = Math.max(tolerance, 200)
    for (const line of lines) {
      for (let index = 1; index < line.length; index += 1) {
        const a = line[index - 1]!
        const b = line[index]!
        const lengthMeters = Math.hypot((b[0] - a[0]) * this.lngScale, (b[1] - a[1]) * METERS_PER_DEGREE)
        const steps = Math.max(1, Math.ceil(lengthMeters / (cellMeters / 2)))
        const keys = new Set<string>()
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps
          keys.add(`${Math.floor((a[0] + (b[0] - a[0]) * t) / this.cellLng)}:${Math.floor((a[1] + (b[1] - a[1]) * t) / this.cellLat)}`)
        }
        for (const key of keys) {
          const cell = this.cells.get(key)
          if (cell) cell.push([a, b])
          else this.cells.set(key, [[a, b]])
        }
      }
    }
  }

  near(point: Coordinate): boolean {
    const x = Math.floor(point[0] / this.cellLng)
    const y = Math.floor(point[1] / this.cellLat)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const [a, b] of this.cells.get(`${x + dx}:${y + dy}`) ?? []) {
          if (this.distanceToSegment(point, a, b) <= this.tolerance) return true
        }
      }
    }
    return false
  }

  private distanceToSegment(p: Coordinate, a: Coordinate, b: Coordinate): number {
    const ax = (a[0] - p[0]) * this.lngScale
    const ay = (a[1] - p[1]) * METERS_PER_DEGREE
    const bx = (b[0] - p[0]) * this.lngScale
    const by = (b[1] - p[1]) * METERS_PER_DEGREE
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared)) : 0
    return Math.hypot(ax + dx * t, ay + dy * t)
  }
}

/** Whether a point lies within `tolerance` meters of any of the lines. */
export function makeLineProximity(lines: EvidenceLines, tolerance: number): (point: Coordinate) => boolean {
  const index = new SegmentIndex(lines, tolerance)
  return (point) => index.near(point)
}

/** Percent of the ride's length that stays within `tolerance` of a reference line. */
export function shareNear(ride: readonly Coordinate[], reference: readonly Coordinate[], tolerance: number): number | null {
  const samples = resampleAlong(ride, EXPLORATION_SAMPLE_METERS)
  if (samples.length === 0 || reference.length < 2) return null
  const index = new SegmentIndex([reference], tolerance)
  const near = samples.filter((sample) => index.near(sample)).length
  return Math.round((near / samples.length) * 100)
}

/** Exploration segments projected onto X-Ray bins, for the new-to-you strip. */
export function explorationBins(segments: readonly ExplorationSegment[], bins: readonly XRayBin[]): Array<ExplorationSegment["status"] | null> {
  return bins.map((bin) => {
    const middle = (bin.fromMeters + bin.toMeters) / 2
    return segments.find((segment) => middle >= segment.fromMeters && middle <= segment.toMeters)?.status ?? null
  })
}
