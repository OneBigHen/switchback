import type {
  RidePreferenceAxis,
  RidePreferenceVector
} from "@/lib/ai/ride-preferences"
import type { PlannedRoute } from "@/lib/routing/types"

export type RideMemorySource =
  | "recorded-ride"
  | "saved-route"
  | "trip-plan"
  | "project-gpx"

export interface RideFingerprintEvidence {
  twistiness: boolean
  elevation: boolean
  surface: boolean
  roadClass: boolean
}

export interface RideFingerprint {
  version: 1
  rideId: string
  source: RideMemorySource
  distanceMiles: number
  durationMinutes: number | null
  twistiness: number
  ascentMetersPerMile: number | null
  gravelShare: number | null
  highwayShare: number | null
  confidence: number
  /**
   * Explicit provenance for values that must not silently become learned facts.
   * Older/manual fingerprints may omit this; their explicitly supplied values
   * remain usable for backwards-compatible deterministic fixtures.
   */
  evidence?: RideFingerprintEvidence
}

export interface RideFingerprintMetadata {
  rideId?: string
  source: RideMemorySource
}

export interface LearnedAxisSupport {
  samples: number
  learned: boolean
  confidence: number
}

export interface LearnedRiderProfile {
  vector: RidePreferenceVector
  axisSupport: Record<RidePreferenceAxis, LearnedAxisSupport>
  rideCount: number
  confidence: number
}

const MIN_LEARNING_SAMPLES = 3
const FULL_CONFIDENCE_SAMPLES = 8
const ELEVATION_FULL_SCALE_METERS_PER_MILE = 50

const KNOWN_SURFACES = new Set([
  "PAVED",
  "ASPHALT",
  "CONCRETE",
  "PAVING_STONES",
  "COBBLESTONE",
  "COMPACTED",
  "GRAVEL",
  "FINE_GRAVEL",
  "UNPAVED",
  "DIRT",
  "GROUND",
  "GRASS",
  "SAND",
  "ICE"
])

const GRAVEL_SURFACES = new Set([
  "GRAVEL",
  "FINE_GRAVEL",
  "UNPAVED",
  "DIRT",
  "GROUND",
  "GRASS",
  "SAND"
])

const KNOWN_ROAD_CLASSES = new Set([
  "MOTORWAY",
  "MOTORWAY_LINK",
  "TRUNK",
  "TRUNK_LINK",
  "PRIMARY",
  "PRIMARY_LINK",
  "SECONDARY",
  "SECONDARY_LINK",
  "TERTIARY",
  "TERTIARY_LINK",
  "RESIDENTIAL",
  "UNCLASSIFIED",
  "SERVICE",
  "ROAD",
  "TRACK",
  "OTHER"
])

const HIGHWAY_ROAD_CLASSES = new Set([
  "MOTORWAY",
  "MOTORWAY_LINK",
  "TRUNK",
  "TRUNK_LINK"
])

const AXES: RidePreferenceAxis[] = [
  "twistiness",
  "scenery",
  "gravel",
  "technicality",
  "elevation",
  "highwayAversion"
]

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function normalizedDistributionShare(
  distribution: Readonly<Record<string, number>>,
  selected: ReadonlySet<string>,
  known: ReadonlySet<string>
): number | null {
  let recognizedTotal = 0
  let matching = 0

  for (const [rawKey, rawValue] of Object.entries(distribution)) {
    if (!Number.isFinite(rawValue) || rawValue <= 0) continue
    const key = rawKey.trim().toUpperCase()
    if (!known.has(key)) continue
    recognizedTotal += rawValue
    if (selected.has(key)) matching += rawValue
  }

  // A distribution containing only unknown classifications is not evidence of
  // zero gravel/highway use. Preserve the distinction so learning cannot turn
  // missing provider semantics into a confident preference.
  if (recognizedTotal <= 0) return null
  return clampUnit(matching / recognizedTotal)
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate a median without values")
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function assertBaseline(vector: RidePreferenceVector): void {
  for (const axis of AXES) {
    const value = vector[axis]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Ride preference ${axis} must be between 0 and 1`)
    }
  }
}

/**
 * Compact, deterministic route character for retrieval and preference learning.
 * It intentionally consumes only facts already present on a PlannedRoute; no
 * model call, map lookup, or geometry generation occurs here.
 */
export function fingerprintPlannedRoute(
  route: PlannedRoute,
  metadata: RideFingerprintMetadata
): RideFingerprint {
  const distanceMiles = finiteNonNegative(route.distanceMiles) ?? 0
  const durationMinutes = finiteNonNegative(route.durationMinutes)
  const ascentMeters = finiteNonNegative(route.ascentMeters)
  const rawTwistiness = finiteNonNegative(route.twistiness)

  const ascentMetersPerMile = ascentMeters !== null && distanceMiles > 0
    ? Number((ascentMeters / distanceMiles).toFixed(4))
    : null
  const gravelShare = normalizedDistributionShare(route.surfaceMix, GRAVEL_SURFACES, KNOWN_SURFACES)
  const highwayShare = normalizedDistributionShare(route.roadMix, HIGHWAY_ROAD_CLASSES, KNOWN_ROAD_CLASSES)
  const twistiness = clampUnit((rawTwistiness ?? 0) / 100)
  const evidence: RideFingerprintEvidence = {
    twistiness: rawTwistiness !== null,
    elevation: ascentMetersPerMile !== null,
    surface: gravelShare !== null,
    roadClass: highwayShare !== null
  }

  const observedAxes = Object.values(evidence).filter(Boolean).length

  return {
    version: 1,
    rideId: metadata.rideId?.trim() || route.id,
    source: metadata.source,
    distanceMiles,
    durationMinutes,
    twistiness,
    ascentMetersPerMile,
    gravelShare,
    highwayShare,
    confidence: Number((observedAxes / 4).toFixed(4)),
    evidence
  }
}

function support(samples: number): LearnedAxisSupport {
  const learned = samples >= MIN_LEARNING_SAMPLES
  return {
    samples,
    learned,
    confidence: learned
      ? clampUnit(samples / FULL_CONFIDENCE_SAMPLES)
      : 0
  }
}

function safeConfidence(fingerprint: RideFingerprint): number {
  return Number.isFinite(fingerprint.confidence)
    ? Math.max(0, Math.min(1, fingerprint.confidence))
    : 0
}

function fingerprintTieBreakKey(fingerprint: RideFingerprint): string {
  const evidence = fingerprint.evidence
  return [
    fingerprint.source,
    fingerprint.distanceMiles,
    fingerprint.durationMinutes ?? "",
    fingerprint.twistiness,
    fingerprint.ascentMetersPerMile ?? "",
    fingerprint.gravelShare ?? "",
    fingerprint.highwayShare ?? "",
    safeConfidence(fingerprint),
    evidence?.twistiness === false ? 0 : 1,
    evidence?.elevation === false ? 0 : 1,
    evidence?.surface === false ? 0 : 1,
    evidence?.roadClass === false ? 0 : 1
  ].join("|")
}

function preferredDuplicate(left: RideFingerprint, right: RideFingerprint): RideFingerprint {
  const leftConfidence = safeConfidence(left)
  const rightConfidence = safeConfidence(right)
  if (leftConfidence !== rightConfidence) {
    return leftConfidence > rightConfidence ? left : right
  }

  // Conflicting records for one stable ride id are bad input, but learning must
  // still be deterministic. Choose the same canonical record regardless of the
  // order storage returned them in rather than allowing array order to affect
  // a rider profile.
  return fingerprintTieBreakKey(left).localeCompare(fingerprintTieBreakKey(right)) >= 0
    ? left
    : right
}

function uniqueFingerprints(fingerprints: readonly RideFingerprint[]): RideFingerprint[] {
  const byId = new Map<string, RideFingerprint>()
  for (const fingerprint of fingerprints) {
    const id = fingerprint.rideId.trim()
    if (!id) continue
    const existing = byId.get(id)
    byId.set(id, existing ? preferredDuplicate(existing, fingerprint) : fingerprint)
  }
  return [...byId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, fingerprint]) => fingerprint)
}

function measuredValues(
  fingerprints: readonly RideFingerprint[],
  read: (fingerprint: RideFingerprint) => number | null
): number[] {
  const values: number[] = []
  for (const fingerprint of fingerprints) {
    const value = read(fingerprint)
    if (value === null || !Number.isFinite(value)) continue
    values.push(clampUnit(value))
  }
  return values
}

/**
 * Learn only from axes for which Switchback currently owns measured evidence.
 * Unsupported/sparse axes preserve the supplied current-intent baseline.
 */
export function deriveLearnedRiderProfile(
  fingerprints: readonly RideFingerprint[],
  baseline: RidePreferenceVector
): LearnedRiderProfile {
  assertBaseline(baseline)
  const unique = uniqueFingerprints(fingerprints)

  const values: Partial<Record<RidePreferenceAxis, number[]>> = {
    twistiness: measuredValues(unique, (fingerprint) =>
      fingerprint.evidence?.twistiness === false ? null : fingerprint.twistiness),
    gravel: measuredValues(unique, (fingerprint) =>
      fingerprint.evidence?.surface === false ? null : fingerprint.gravelShare),
    elevation: measuredValues(unique, (fingerprint) =>
      fingerprint.evidence?.elevation === false || fingerprint.ascentMetersPerMile === null
        ? null
        : fingerprint.ascentMetersPerMile / ELEVATION_FULL_SCALE_METERS_PER_MILE),
    highwayAversion: measuredValues(unique, (fingerprint) =>
      fingerprint.evidence?.roadClass === false || fingerprint.highwayShare === null
        ? null
        : 1 - fingerprint.highwayShare)
  }

  const axisSupport = Object.fromEntries(AXES.map((axis) => [
    axis,
    support(values[axis]?.length ?? 0)
  ])) as Record<RidePreferenceAxis, LearnedAxisSupport>

  const vector: RidePreferenceVector = { ...baseline }
  for (const axis of AXES) {
    const samples = values[axis] ?? []
    if (!axisSupport[axis].learned || samples.length === 0) continue
    vector[axis] = clampUnit(median(samples))
  }

  const learnedConfidences = AXES
    .map((axis) => axisSupport[axis])
    .filter((entry) => entry.learned)
    .map((entry) => entry.confidence)

  return {
    vector,
    axisSupport,
    rideCount: unique.length,
    confidence: learnedConfidences.length === 0
      ? 0
      : Number((learnedConfidences.reduce((sum, value) => sum + value, 0) / learnedConfidences.length).toFixed(4))
  }
}
