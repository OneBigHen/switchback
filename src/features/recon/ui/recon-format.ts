/**
 * Side-effect-free formatting for Recon UI. Known facts render as facts;
 * unknown facts render as an em dash or nothing — never a fake zero.
 */

const METERS_PER_MILE = 1609.344
const FEET_PER_METER = 3.28084

export function miles(meters: number, digits = 1): string {
  return `${(meters / METERS_PER_MILE).toFixed(digits)} mi`
}

export function feet(meters: number | null): string {
  return meters === null ? "—" : `${Math.round(meters * FEET_PER_METER).toLocaleString()} ft`
}

export function mph(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} mph`
}

/** `1:07:32` or `7:32` for an elapsed duration. */
export function clock(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—"
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

/** `2 h 14 min` / `48 min`. */
export function duration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—"
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  return hours > 0 ? `${hours} h ${rounded % 60} min` : `${rounded} min`
}

export function rideDate(ms: number | null): string {
  if (ms === null) return ""
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

export function shortDate(ms: number | null): string {
  if (ms === null) return ""
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function timeOfDay(ms: number | null): string {
  if (ms === null) return "—"
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
