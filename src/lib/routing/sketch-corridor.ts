import type { Coordinate } from "./types"
import { haversine, pointToSegmentDistanceMeters } from "./scoring"

/**
 * Free-draw strokes as *soft corridors*.
 *
 * A rider's rough line is intent, not geometry. Pinning it down with a full set
 * of hard `via` waypoints produces exactly one route and makes every comparison
 * profile collapse onto the same line, so the alternatives call returns nothing.
 *
 * These pure helpers turn the stroke into a bounded corridor instead: a sampled
 * reference line, a lateral envelope derived from its own length, a measurable
 * adherence score, and shaping anchors at several relaxation levels. The planner
 * uses them to propose genuinely different options; scoring uses adherence as a
 * real axis so "hugs the drawn line" competes with road quality rather than
 * overriding it.
 */

/** Wire cap: the stroke is resampled to at most this many coordinates. */
export const MAX_CORRIDOR_SAMPLES = 48

/** Rider-facing role of one corridor option. */
export type CorridorOptionRole = "traced" | "better-roads" | "leaner"

export interface CorridorOptionPresentation {
  label: string
  /** One line explaining what the option did with the drawn stroke. */
  description: string
}

export const CORRIDOR_OPTION_PRESENTATION: Readonly<Record<CorridorOptionRole, CorridorOptionPresentation>> =
  Object.freeze({
    traced: {
      label: "Traced",
      description: "Hugs the line you drew."
    },
    "better-roads": {
      label: "Better roads nearby",
      description: "Keeps your corridor but swaps in better roads close to it."
    },
    leaner: {
      label: "Leaner",
      description: "Treats the line as a hint and cuts the detours."
    }
  })

function isFiniteCoordinate(value: Coordinate | undefined): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90
}

/** Total along-stroke length in meters. */
export function corridorLengthMeters(samples: readonly Coordinate[]): number {
  let total = 0
  for (let index = 1; index < samples.length; index += 1) {
    total += haversine(samples[index - 1]!, samples[index]!)
  }
  return total
}

/**
 * Resample a raw stroke to evenly spaced coordinates, keeping both endpoints.
 * Even spacing matters: adherence is measured per sample, so a stroke drawn
 * slowly through one bend must not out-vote the rest of the line.
 */
export function sampleSketchCorridor(
  trace: readonly Coordinate[],
  maxSamples = MAX_CORRIDOR_SAMPLES
): Coordinate[] {
  const clean = trace.filter(isFiniteCoordinate)
  if (clean.length < 2) return clean.slice(0, 1)
  const limit = Math.max(2, Math.min(maxSamples, MAX_CORRIDOR_SAMPLES))
  const total = corridorLengthMeters(clean)
  if (total <= 0) return [clean[0]!, clean[clean.length - 1]!]

  const spacing = total / (limit - 1)
  const samples: Coordinate[] = [clean[0]!]
  let travelled = 0
  let nextTarget = spacing
  for (let index = 1; index < clean.length && samples.length < limit - 1; index += 1) {
    const start = clean[index - 1]!
    const end = clean[index]!
    const segment = haversine(start, end)
    if (segment <= 0) continue
    while (nextTarget <= travelled + segment && samples.length < limit - 1) {
      const ratio = (nextTarget - travelled) / segment
      samples.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ])
      nextTarget += spacing
    }
    travelled += segment
  }
  samples.push(clean[clean.length - 1]!)
  return samples
}

/** Minimum lateral half-width of the soft corridor, in meters. */
export const MIN_CORRIDOR_ENVELOPE_METERS = 600
/** Maximum lateral half-width; beyond this the stroke stops meaning anything. */
export const MAX_CORRIDOR_ENVELOPE_METERS = 8_000
const CORRIDOR_ENVELOPE_LENGTH_SHARE = 0.06

/**
 * How far a route may wander from the drawn line before it stops being the
 * ride the rider asked for. Derived from the stroke's own length so a 4-mile
 * doodle and a 200-mile sweep both get a sane band.
 */
export function corridorEnvelopeMeters(samples: readonly Coordinate[]): number {
  const length = corridorLengthMeters(samples)
  return Math.min(
    MAX_CORRIDOR_ENVELOPE_METERS,
    Math.max(MIN_CORRIDOR_ENVELOPE_METERS, length * CORRIDOR_ENVELOPE_LENGTH_SHARE)
  )
}

export interface CorridorScoringContext {
  samples: Coordinate[]
  envelopeMeters: number
}

/**
 * The scoring context for a request's stroke, or `undefined` when the request
 * carried none. Providers call this so adherence is attached where every other
 * score axis is attached, instead of being bolted on later by the planner.
 */
export function sketchCorridorContext(
  sketchCorridor: readonly Coordinate[] | undefined
): CorridorScoringContext | undefined {
  if (!sketchCorridor || sketchCorridor.length < 2) return undefined
  const samples = sketchCorridor.filter(isFiniteCoordinate)
  if (samples.length < 2) return undefined
  return { samples, envelopeMeters: corridorEnvelopeMeters(samples) }
}

export interface CorridorAdherence {
  /** 0-100: how closely the route follows the drawn stroke. */
  score: number
  /** Mean distance from each stroke sample to the nearest point on the route. */
  meanDeviationMeters: number
  /** Worst single-sample deviation. */
  maxDeviationMeters: number
  /** Share (0..1) of stroke samples the route passes within the envelope. */
  coveredShare: number
}

const EMPTY_ADHERENCE: CorridorAdherence = Object.freeze({
  score: 0,
  meanDeviationMeters: Number.POSITIVE_INFINITY,
  maxDeviationMeters: Number.POSITIVE_INFINITY,
  coveredShare: 0
})

function nearestDistanceMeters(point: Coordinate, geometry: readonly Coordinate[]): number {
  if (geometry.length === 1) return haversine(point, geometry[0]!)
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 1; index < geometry.length; index += 1) {
    const distance = pointToSegmentDistanceMeters(point, geometry[index - 1]!, geometry[index]!)
    if (distance < nearest) nearest = distance
    if (nearest === 0) break
  }
  return nearest
}

/**
 * Measure a routed line against the drawn stroke. Deviation is measured from
 * the *stroke* to the route (not the reverse) on purpose: a route that covers
 * the whole drawing and then adds a loop elsewhere still traced what the rider
 * asked for — the extra distance is priced by the detour penalty, not here.
 */
export function corridorAdherence(
  geometry: readonly Coordinate[],
  samples: readonly Coordinate[],
  envelopeMeters: number
): CorridorAdherence {
  if (geometry.length < 1 || samples.length < 1) return EMPTY_ADHERENCE
  const envelope = Math.max(1, envelopeMeters)
  let total = 0
  let worst = 0
  let covered = 0
  for (const sample of samples) {
    const distance = nearestDistanceMeters(sample, geometry)
    total += distance
    if (distance > worst) worst = distance
    if (distance <= envelope) covered += 1
  }
  const mean = total / samples.length
  const coveredShare = covered / samples.length
  const meanFit = Math.max(0, 1 - mean / envelope)
  return {
    score: Math.round(100 * Math.max(0, Math.min(1, coveredShare * 0.6 + meanFit * 0.4))),
    meanDeviationMeters: Math.round(mean),
    maxDeviationMeters: Math.round(worst),
    coveredShare: Number(coveredShare.toFixed(3))
  }
}

/**
 * Interior shaping anchors for one relaxation level. `count` of 0 hands the
 * engine the endpoints alone; higher counts pin the line progressively harder.
 * Anchors sit at evenly spaced interior fractions of the stroke so the shape is
 * preserved even when only one or two survive.
 */
export function corridorShapingAnchors(
  samples: readonly Coordinate[],
  count: number
): Coordinate[] {
  const usable = Math.max(0, Math.trunc(count))
  if (usable === 0 || samples.length < 3) return []
  const interior = samples.slice(1, -1)
  if (interior.length === 0) return []
  const limit = Math.min(usable, interior.length)
  return Array.from({ length: limit }, (_, index) => {
    const position = Math.round((index + 1) * (interior.length + 1) / (limit + 1)) - 1
    return interior[Math.max(0, Math.min(interior.length - 1, position))]!
  })
}
