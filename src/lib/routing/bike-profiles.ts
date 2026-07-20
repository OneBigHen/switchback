import type { RoadSurfaceTag, RoadSmoothnessTag, RoadTracktypeTag } from "@/lib/roads/road-access"

/**
 * Motorcycle preset class. Maps to OSM access, surface, smoothness, and
 * tracktype filtering rules. Each preset is a *tuning overlay* on the
 * universal graph schema, not a separate codebase.
 */
export type MotorcycleProfileCategory = "street" | "touring" | "adventure" | "dual-sport"

export type BikeProfileCategory = MotorcycleProfileCategory

/**
 * Concrete bike profile. The four built-in presets cover the riding
 * styles the lead decision calls out; riders can override range and
 * surface tolerance per bike without defining a new category.
 */
export interface BikeProfile {
  /** Stable identifier, e.g. "street", "custom-f650gs". */
  name: string
  category: BikeProfileCategory
  wetWeightKg?: number
  /** Practical range in miles before the rider should refuel. */
  fuelRangeMiles: number
  /** Reserve range the bike should keep for unplanned detours. */
  reserveMiles: number
  /** Permit maintained gravel (compacted surface, grade1-2 tracktype). */
  allowMaintainedGravel: boolean
  /** Permit rough tracks (grade3-5 tracktype, deep gravel, sand, mud). */
  allowRoughTracks: boolean
  /** Hard-block edges whose surface tag is missing entirely. */
  avoidUnknownSurface: boolean
}

const STREET_PROFILE: BikeProfile = {
  name: "Street",
  category: "street",
  fuelRangeMiles: 180,
  reserveMiles: 35,
  allowMaintainedGravel: false,
  allowRoughTracks: false,
  avoidUnknownSurface: true
}

const TOURING_PROFILE: BikeProfile = {
  name: "Touring",
  category: "touring",
  fuelRangeMiles: 280,
  reserveMiles: 45,
  allowMaintainedGravel: false,
  allowRoughTracks: false,
  avoidUnknownSurface: true
}

const ADVENTURE_PROFILE: BikeProfile = {
  name: "Adventure",
  category: "adventure",
  fuelRangeMiles: 260,
  reserveMiles: 45,
  allowMaintainedGravel: true,
  allowRoughTracks: false,
  avoidUnknownSurface: false
}

const DUAL_SPORT_PROFILE: BikeProfile = {
  name: "Dual-Sport",
  category: "dual-sport",
  fuelRangeMiles: 160,
  reserveMiles: 30,
  allowMaintainedGravel: true,
  allowRoughTracks: true,
  avoidUnknownSurface: false
}

export const MOTORCYCLE_PROFILES: readonly BikeProfile[] = [
  STREET_PROFILE,
  TOURING_PROFILE,
  ADVENTURE_PROFILE,
  DUAL_SPORT_PROFILE
] as const

export function getBikeProfile(name: string): BikeProfile | undefined {
  return MOTORCYCLE_PROFILES.find((profile) => profile.name.toLowerCase() === name.toLowerCase())
}

export function listBikeProfiles(): BikeProfile[] {
  return MOTORCYCLE_PROFILES.map((profile) => ({ ...profile }))
}

/** Convenience function: which surfaces are *forbidden* by a profile. */
export function disallowedSurfaces(profile: BikeProfile): ReadonlySet<RoadSurfaceTag> {
  if (profile.category === "street" || profile.category === "touring") {
    return new Set<RoadSurfaceTag>([
      "dirt", "earth", "gravel", "fine_gravel", "grass", "sand", "mud", "ground"
    ])
  }
  if (profile.category === "adventure") {
    return new Set<RoadSurfaceTag>(["mud", "sand"])
  }
  return new Set<RoadSurfaceTag>()
}

/** Convenience function: which smoothness tags are *forbidden* by a profile. */
export function disallowedSmoothness(profile: BikeProfile): ReadonlySet<RoadSmoothnessTag> {
  if (profile.category === "street") {
    return new Set<RoadSmoothnessTag>(["bad", "very_bad", "horrible", "very_horrible", "impassable"])
  }
  if (profile.category === "touring") {
    return new Set<RoadSmoothnessTag>(["very_bad", "horrible", "very_horrible", "impassable"])
  }
  if (profile.category === "adventure") {
    return new Set<RoadSmoothnessTag>(["impassable"])
  }
  return new Set<RoadSmoothnessTag>(["impassable"])
}

/** Convenience function: which tracktype tags are *forbidden* by a profile. */
export function disallowedTracktypes(profile: BikeProfile): ReadonlySet<RoadTracktypeTag> {
  if (profile.category === "street" || profile.category === "touring") {
    return new Set<RoadTracktypeTag>(["grade1", "grade2", "grade3", "grade4", "grade5"])
  }
  if (profile.category === "adventure") {
    return new Set<RoadTracktypeTag>(["grade5"])
  }
  return new Set<RoadTracktypeTag>()
}
