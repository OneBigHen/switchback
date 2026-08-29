import type { UnitSystem } from "./rider-settings"

export interface FormattedDistance {
  readonly value: string
  readonly unit: string
}

const FEET_PER_METER = 3.28084
const METERS_PER_KILOMETER = 1_000
const METERS_PER_MILE = 1_609.344
const SHORT_IMPERIAL_DISTANCE_METERS = METERS_PER_MILE

function formatDistanceValue(distanceMeters: number | null | undefined, units: UnitSystem): FormattedDistance {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return { value: "Unavailable", unit: "" }
  }
  const meters = distanceMeters
  if (units === "metric") {
    return meters < METERS_PER_KILOMETER
      ? { value: String(Math.round(meters)), unit: "m" }
      : { value: (meters / METERS_PER_KILOMETER).toFixed(1), unit: "km" }
  }
  return meters < SHORT_IMPERIAL_DISTANCE_METERS
    ? { value: String(Math.round(meters * FEET_PER_METER / 10) * 10), unit: "ft" }
    : { value: (meters / METERS_PER_MILE).toFixed(1), unit: "mi" }
}

export function formatDistanceMeters(
  distanceMeters: number | null | undefined,
  units: UnitSystem
): FormattedDistance {
  return formatDistanceValue(distanceMeters, units)
}

export function formatDistanceMiles(
  distanceMiles: number | null | undefined,
  units: UnitSystem
): FormattedDistance {
  if (distanceMiles == null || !Number.isFinite(distanceMiles) || distanceMiles < 0) {
    return { value: "Unavailable", unit: "" }
  }
  return formatDistanceMeters(distanceMiles * METERS_PER_MILE, units)
}

export function formatManeuverDistance(distanceMeters: number, units: UnitSystem): string {
  const formatted = formatDistanceMeters(distanceMeters, units)
  return `${formatted.value}${formatted.unit ? ` ${formatted.unit}` : ""}`
}
