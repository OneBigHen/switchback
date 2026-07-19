import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

export type PreferenceSignalSource = "rating" | "manual-edit" | "completed-ride" | "skipped-road"

export interface RiderPreferenceSignal {
  route: PlannedRoute
  motorcycleId: string
  rating: 1 | 2 | 3 | 4 | 5
  source: PreferenceSignalSource
}

export interface RiderPreference {
  motorcycleId: string
  profile: RouteProfileId
  sampleCount: number
  weightedSamples: number
  meanRating: number
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

function sourceWeight(source: PreferenceSignalSource): number {
  if (source === "manual-edit") return 1.5
  if (source === "completed-ride") return 1.25
  if (source === "skipped-road") return 0.75
  return 1
}

function weightedAverage(previous: number, previousWeight: number, next: number, nextWeight: number): number {
  return Number(((previous * previousWeight + next * nextWeight) / (previousWeight + nextWeight)).toFixed(2))
}

export function updateRiderPreference(
  current: RiderPreference | null,
  signal: RiderPreferenceSignal,
  now = new Date().toISOString()
): RiderPreference {
  const motorcycleId = signal.motorcycleId.trim().slice(0, 80) || "default"
  if (current && (current.motorcycleId !== motorcycleId || current.profile !== signal.route.profile)) {
    throw new Error("Preferences must be updated within the same motorcycle and routing profile.")
  }
  const weight = sourceWeight(signal.source)
  const twistiness = signal.route.twistiness
  const unpaved = unpavedPercent(signal.route)
  const duration = signal.route.durationMinutes
  if (!current) {
    return {
      motorcycleId,
      profile: signal.route.profile,
      sampleCount: 1,
      weightedSamples: weight,
      meanRating: signal.rating,
      preferredTwistiness: twistiness,
      preferredUnpavedPercent: unpaved,
      preferredDurationMinutes: duration,
      updatedAt: now
    }
  }
  return {
    ...current,
    sampleCount: current.sampleCount + 1,
    weightedSamples: Number((current.weightedSamples + weight).toFixed(2)),
    meanRating: weightedAverage(current.meanRating, current.weightedSamples, signal.rating, weight),
    preferredTwistiness: weightedAverage(current.preferredTwistiness, current.weightedSamples, twistiness, weight),
    preferredUnpavedPercent: weightedAverage(current.preferredUnpavedPercent, current.weightedSamples, unpaved, weight),
    preferredDurationMinutes: weightedAverage(current.preferredDurationMinutes, current.weightedSamples, duration, weight),
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
      reasons: ["No explicit preference history exists for this motorcycle and ride style yet."]
    }
  }
  const twistinessFit = closeness(route.twistiness, preference.preferredTwistiness, 45)
  const unpavedFit = closeness(unpavedPercent(route), preference.preferredUnpavedPercent, 60)
  const durationFit = closeness(route.durationMinutes, preference.preferredDurationMinutes, Math.max(60, preference.preferredDurationMinutes))
  const score = Math.round((twistinessFit * 0.5 + unpavedFit * 0.25 + durationFit * 0.25) * 100)
  const confidence = preference.sampleCount >= 12 ? "high" : preference.sampleCount >= 5 ? "medium" : "low"
  const reasons = [
    `Twistiness is ${Math.round(twistinessFit * 100)}% aligned with your explicit preference.`,
    `Surface mix is ${Math.round(unpavedFit * 100)}% aligned with your ${preference.motorcycleId} history.`,
    `Ride duration is ${Math.round(durationFit * 100)}% aligned with your saved trips.`
  ]
  return { score, confidence, reasons }
}
