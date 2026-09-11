/**
 * Client-safe presentation rules for shared catalog routes.
 *
 * These helpers may clean or classify facts already present in catalog data,
 * but they must not invent route characteristics or turn unknown values into
 * confident rider-facing claims.
 */

/**
 * Remove known bulk-import/file-sharing noise while preserving the rider's
 * actual route name. This is deliberately deterministic and non-generative.
 */
export function cleanCatalogRouteName(name: string): string {
  return name
    .trim()
    .replace(/\.(?:gpx|kml|kmz)$/i, "")
    .replace(/\s*[-–—]?\s*created by\b.*$/i, "")
    .replace(/^\d{2,}[\s._-]+(?=\D)/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Normalize imported duration sentinels at the presentation boundary. Zero,
 * negatives, non-numbers, NaN, and infinity mean "unknown", never "0 min".
 */
export function knownDurationMinutes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}
