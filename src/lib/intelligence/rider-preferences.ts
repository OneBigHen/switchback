import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

export type PreferenceSignalSource =
  | "rating"
  | "manual-edit"
  | "completed-ride"
  | "skipped-road"
  | "suggestion-accepted"

export interface RiderPreferenceSignal {
  route: PlannedRoute
  /** Stable bike identity (bike.id), never the mutable display name (SB-011). */
  bikeId: string
  rating: 1 | 2 | 3 | 4 | 5
  source: PreferenceSignalSource
}

/** Feature centroid of the rider's liked (positive) or disliked (negative) routes. */
export interface FeatureCentroid {
  twistiness: number
  unpavedPercent: number
  durationMinutes: number
  /** Total weight of the signals that shaped this centroid. */
  weight: number
}

export interface RiderPreference {
  bikeId: string
  profile: RouteProfileId
  sampleCount: number
  weightedSamples: number
  meanRating: number
  positive: FeatureCentroid
  negative: FeatureCentroid
  /** Derived from the positive centroid only — dislikes never pull these. */
  preferredTwistiness: number
  preferredUnpavedPercent: number
  preferredDurationMinutes: number
  updatedAt: string
}

export interface RouteFitExplanation {
  score: number
  confidence: "low" | "medium" | "high"
  reasons: string[]
}

const UNPAVED_SURFACES = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])

function unpavedPercent(route: PlannedRoute): number {
  return Object.entries(route.surfaceMix).reduce(
    (total, [surface, percent]) => total + (UNPAVED_SURFACES.has(surface.toLowerCase()) ? percent : 0),
    0
  )
}

/**
 * Signed signal weights (SB-010): a dislike moves the NEGATIVE centroid, so
 * it can never increase affinity for the disliked features.
 *   rating:  5★ +2 · 4★ +1 · 3★ 0 · 2★ −1 · 1★ −2
 *   suggestion accepted +1 · ignored −0.5 · less-like-this −2
 *   manual edit toward road +1 · completed ride weak positive +0.5
 */
export function signalWeight(signal: RiderPreferenceSignal): number {
  switch (signal.source) {
    case "rating":
      return signal.rating - 3
    case "suggestion-accepted":
      return 1
    case "skipped-road":
      return -0.5
    case "manual-edit":
      return 1
    case "completed-ride":
      return 0.5
  }
}

function emptyCentroid(): FeatureCentroid {
  return { twistiness: 0, unpavedPercent: 0, durationMinutes: 0, weight: 0 }
}

function mergeCentroid(centroid: FeatureCentroid, route: PlannedRoute, weight: number): FeatureCentroid {
  const totalWeight = centroid.weight + weight
  if (totalWeight <= 0) return centroid
  return {
    twistiness: (centroid.twistiness * centroid.weight + route.twistiness * weight) / totalWeight,
    unpavedPercent: (centroid.unpavedPercent * centroid.weight + unpavedPercent(route) * weight) / totalWeight,
    durationMinutes: (centroid.durationMinutes * centroid.weight + route.durationMinutes * weight) / totalWeight,
    weight: totalWeight
  }
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

export function updateRiderPreference(
  current: RiderPreference | null,
  signal: RiderPreferenceSignal,
  now = new Date().toISOString()
): RiderPreference {
  const bikeId = signal.bikeId.trim().slice(0, 80) || "default"
  if (current && (current.bikeId !== bikeId || current.profile !== signal.route.profile)) {
    throw new Error("Preferences must be updated within the same bike and routing profile.")
  }
  const weight = signalWeight(signal)
  const positive = current?.positive ?? emptyCentroid()
  const negative = current?.negative ?? emptyCentroid()

  // A zero-weight (3★) signal still counts as a sample but changes nothing.
  const nextPositive = weight > 0 ? mergeCentroid(positive, signal.route, weight) : positive
  const nextNegative = weight < 0 ? mergeCentroid(negative, signal.route, -weight) : negative

  const preferredTwistiness = nextPositive.weight > 0 ? nextPositive.twistiness : 0
  const preferredUnpavedPercent = nextPositive.weight > 0 ? nextPositive.unpavedPercent : 0
  const preferredDurationMinutes = nextPositive.weight > 0 ? nextPositive.durationMinutes : 0

  const previousSamples = current?.weightedSamples ?? 0
  const nextWeighted = Number((previousSamples + Math.abs(weight)).toFixed(2))
  const meanRating = current
    ? round((current.meanRating * previousSamples + signal.rating * Math.abs(weight)) / Math.max(1, nextWeighted))
    : signal.rating

  return {
    bikeId,
    profile: signal.route.profile,
    sampleCount: (current?.sampleCount ?? 0) + 1,
    weightedSamples: nextWeighted,
    meanRating,
    positive: nextPositive,
    negative: nextNegative,
    preferredTwistiness: round(preferredTwistiness),
    preferredUnpavedPercent: round(preferredUnpavedPercent),
    preferredDurationMinutes: round(preferredDurationMinutes),
    updatedAt: now
  }
}

function closeness(actual: number, preferred: number, scale: number): number {
  return Math.max(0, 1 - Math.abs(actual - preferred) / scale)
}

export function explainRouteFit(preference: RiderPreference | null, route: PlannedRoute): RouteFitExplanation {
  if (!preference || preference.profile !== route.profile) {
    return {
      score: 50,
      confidence: "low",
      reasons: ["No explicit preference history exists for this bike and ride style yet."]
    }
  }
  const twistinessFit = closeness(route.twistiness, preference.preferredTwistiness, 45)
  const unpavedFit = closeness(unpavedPercent(route), preference.preferredUnpavedPercent, 60)
  const durationFit = closeness(route.durationMinutes, preference.preferredDurationMinutes, Math.max(60, preference.preferredDurationMinutes))
  // Disliked features reduce the fit: if this route resembles the negative
  // centroid, the score drops even when it matches the positive one.
  const negativePenalty = preference.negative.weight > 0
    ? 0.5 * (
        closeness(route.twistiness, preference.negative.twistiness, 45)
        + closeness(unpavedPercent(route), preference.negative.unpavedPercent, 60)
      ) / 2
    : 0
  const raw = (twistinessFit * 0.5 + unpavedFit * 0.25 + durationFit * 0.25)
  const score = Math.round(Math.max(0, Math.min(100, (raw - negativePenalty) * 100)))
  const confidence = preference.sampleCount >= 12 ? "high" : preference.sampleCount >= 5 ? "medium" : "low"
  const reasons = [
    `Twistiness is ${Math.round(twistinessFit * 100)}% aligned with your explicit preference.`,
    `Surface mix is ${Math.round(unpavedFit * 100)}% aligned with your ${preference.bikeId} history.`,
    `Ride duration is ${Math.round(durationFit * 100)}% aligned with your saved trips.`
  ]
  if (negativePenalty > 0.05) {
    reasons.push("This route also resembles roads you rated low; fit is reduced accordingly.")
  }
  return { score, confidence, reasons }
}
