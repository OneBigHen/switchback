import type { RiderSettings } from "@/lib/settings/rider-settings"
import { RIDER_SETTINGS_VERSION } from "@/lib/settings/rider-settings"
import type { RiderPreference } from "@/lib/intelligence/rider-preferences"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"

/**
 * Unified local export (SB-024): settings, bikes, learned preferences, saved
 * routes, and trip plans in one versioned payload. Raw GPS trails and
 * provider secrets are never included; ride metadata is summarized, not
 * dumped.
 */

export const UNIFIED_EXPORT_FORMAT = "switchback-backup"
export const UNIFIED_EXPORT_VERSION = 1

export interface RideMetadataSummary {
  count: number
  latestAt: string | null
  totalDistanceMiles: number
  totalDurationMinutes: number
}

export interface UnifiedExport {
  format: "switchback-backup"
  version: number
  exportedAt: string
  appVersion: string
  schemaVersions: {
    riderSettings: number
  }
  settings: RiderSettings
  preferences: RiderPreference[]
  routes: SavedRoute[]
  trips: TripPlan[]
  rides: RideMetadataSummary
}

export interface UnifiedExportInput {
  settings: RiderSettings
  preferences: RiderPreference[]
  routes: SavedRoute[]
  trips: TripPlan[]
  rideSummary: RideMetadataSummary
  appVersion?: string
  exportedAt?: string
}

export function createUnifiedExport(input: UnifiedExportInput): UnifiedExport {
  return {
    format: UNIFIED_EXPORT_FORMAT,
    version: UNIFIED_EXPORT_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    appVersion: input.appVersion ?? "unknown",
    schemaVersions: {
      riderSettings: RIDER_SETTINGS_VERSION
    },
    settings: structuredClone(input.settings),
    preferences: structuredClone(input.preferences),
    routes: structuredClone(input.routes),
    trips: structuredClone(input.trips),
    rides: { ...input.rideSummary }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Strictly validates a unified export so a corrupted or foreign payload can
 * never overwrite local data (SB-024).
 */
export function validateUnifiedExport(parsed: unknown): UnifiedExport | null {
  if (!isPlainObject(parsed)) return null
  if (parsed.format !== UNIFIED_EXPORT_FORMAT) return null
  if (parsed.version !== UNIFIED_EXPORT_VERSION) return null
  if (typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt))) return null
  if (typeof parsed.appVersion !== "string") return null
  if (!isPlainObject(parsed.settings) || parsed.settings.version !== RIDER_SETTINGS_VERSION) return null
  if (!Array.isArray(parsed.preferences) || !Array.isArray(parsed.routes) || !Array.isArray(parsed.trips)) return null
  if (!isPlainObject(parsed.rides)) return null
  return parsed as unknown as UnifiedExport
}
