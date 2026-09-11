import type { Coordinate } from "@/lib/routing/types"

export type GravelAtlasOfficialSourceId = "pa-pasda-2012" | "njgin-ng911"
export type GravelAtlasRegion = "PA" | "NJ"
export type GravelSurfaceEvidence = "unpaved" | "unimproved"
export type GravelAccessEvidence = "unknown" | "non-restricted"
export type GravelStatusEvidence = "unknown" | "active"

export interface GravelAtlasSourcePolicy {
  region: GravelAtlasRegion
  label: string
  serviceUrl: string
  where: string
  outFields: readonly string[]
  updateCadence: "as-needed" | "monthly"
  accessAuthority: "none" | "explicit"
  redistribution: "permission-required" | "attribution-requested"
  coverageCaveats: readonly string[]
}

/**
 * Source policy stays separate from routing confidence. These values describe
 * what an official feed is allowed to prove; the live motorcycle graph still
 * owns final routability/access eligibility.
 */
export const GRAVEL_ATLAS_SOURCE_POLICIES: Record<
  GravelAtlasOfficialSourceId,
  GravelAtlasSourcePolicy
> = {
  "pa-pasda-2012": {
    region: "PA",
    label: "PASDA Unpaved Roads of Pennsylvania (2012)",
    serviceUrl: "https://maps.pasda.psu.edu/ArcGIS/rest/services/pasda/PennsylvaniaStateUniversity3/MapServer/1",
    where: "1=1",
    outFields: ["OBJECTID", "LENGTH", "COUNTY", "INSPECTED", "NAME"],
    updateCadence: "as-needed",
    accessAuthority: "none",
    redistribution: "permission-required",
    coverageCaveats: [
      "State and National Forest roads are excluded from this inventory.",
      "Surface inventory does not establish current motorcycle access."
    ]
  },
  "njgin-ng911": {
    region: "NJ",
    label: "NJGIN NG911 Road Centerlines",
    serviceUrl: "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Tran_road/FeatureServer/0",
    where: "SURFACETYP = 'U' AND STATUSTYP = 'A' AND ACCESSSTYP = 'N'",
    outFields: [
      "OBJECTID",
      "GLOBALID",
      "RCL_NGUID",
      "PRIMENAME",
      "JURISDICTN",
      "ACCESSSTYP",
      "STATUSTYP",
      "SURFACETYP",
      "DATEUPDATE"
    ],
    updateCadence: "monthly",
    accessAuthority: "explicit",
    redistribution: "attribution-requested",
    coverageCaveats: [
      "Road centerline attributes are routing evidence, not a land survey or field inspection."
    ]
  }
}

export interface GravelEvidenceObservation {
  sourceId: GravelAtlasOfficialSourceId
  sourceFeatureId: string
  region: GravelAtlasRegion
  geometry: Coordinate[]
  roadName?: string
  county?: string
  jurisdiction?: string
  surfaceEvidence: GravelSurfaceEvidence
  accessEvidence: GravelAccessEvidence
  statusEvidence: GravelStatusEvidence
  inspected: boolean | null
  sourceUpdatedAt?: string
}

interface ArcGisGeoJsonFeature {
  type?: unknown
  id?: unknown
  geometry?: unknown
  properties?: unknown
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function arcGisFeature(value: unknown): ArcGisGeoJsonFeature | null {
  const feature = record(value)
  return feature ? feature as ArcGisGeoJsonFeature : null
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = value[0]
  const lat = value[1]
  if (typeof lon !== "number" || !Number.isFinite(lon) || Math.abs(lon) > 180) return null
  if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) return null
  return [lon, lat]
}

function lineStringGeometry(value: unknown): Coordinate[] | null {
  const geometry = record(value)
  if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null
  const points = geometry.coordinates.map(coordinate)
  if (points.length < 2 || points.some((point) => point === null)) return null
  return points as Coordinate[]
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function featureId(properties: Record<string, unknown>, feature: ArcGisGeoJsonFeature): string | null {
  const raw = properties.OBJECTID ?? feature.id
  if (typeof raw === "string" || typeof raw === "number") {
    const value = String(raw).trim()
    return value.length > 0 ? value : null
  }
  return null
}

function inspectedValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (["yes", "y", "true", "1", "inspected"].includes(normalized)) return true
  if (["no", "n", "false", "0", "not inspected"].includes(normalized)) return false
  return null
}

function isoDate(value: unknown): string | undefined {
  const milliseconds = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(milliseconds)) return undefined
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/**
 * ArcGIS is an untrusted JSON boundary. Accept `unknown` here so every caller
 * gets the same structural validation rather than having to cast service data.
 */
export function normalizePaPasda2012Feature(
  value: unknown
): GravelEvidenceObservation | null {
  const feature = arcGisFeature(value)
  if (!feature || feature.type !== "Feature") return null
  const properties = record(feature.properties)
  const geometry = lineStringGeometry(feature.geometry)
  if (!properties || !geometry) return null
  const id = featureId(properties, feature)
  if (!id) return null
  const roadName = stringValue(properties.NAME)
  const county = stringValue(properties.COUNTY)

  return {
    sourceId: "pa-pasda-2012",
    sourceFeatureId: id,
    region: "PA",
    geometry,
    ...(roadName ? { roadName } : {}),
    ...(county ? { county } : {}),
    surfaceEvidence: "unpaved",
    accessEvidence: "unknown",
    statusEvidence: "unknown",
    inspected: inspectedValue(properties.INSPECTED)
  }
}

/** Validate NJGIN service JSON before applying the official U/A/N evidence gate. */
export function normalizeNjginUnimprovedFeature(
  value: unknown
): GravelEvidenceObservation | null {
  const feature = arcGisFeature(value)
  if (!feature || feature.type !== "Feature") return null
  const properties = record(feature.properties)
  const geometry = lineStringGeometry(feature.geometry)
  if (!properties || !geometry) return null

  if (
    stringValue(properties.SURFACETYP)?.toUpperCase() !== "U" ||
    stringValue(properties.STATUSTYP)?.toUpperCase() !== "A" ||
    stringValue(properties.ACCESSSTYP)?.toUpperCase() !== "N"
  ) return null

  const id = stringValue(properties.RCL_NGUID)
    ?? stringValue(properties.GLOBALID)
    ?? featureId(properties, feature)
  if (!id) return null

  const updated = isoDate(properties.DATEUPDATE)
  const roadName = stringValue(properties.PRIMENAME)
  const jurisdiction = stringValue(properties.JURISDICTN)
  return {
    sourceId: "njgin-ng911",
    sourceFeatureId: id,
    region: "NJ",
    geometry,
    ...(roadName ? { roadName } : {}),
    ...(jurisdiction ? { jurisdiction } : {}),
    surfaceEvidence: "unimproved",
    accessEvidence: "non-restricted",
    statusEvidence: "active",
    inspected: null,
    ...(updated ? { sourceUpdatedAt: updated } : {})
  }
}

/**
 * Build a bounded ArcGIS GeoJSON page URL for offline/staging ingestion.
 * Runtime route planning never calls these statewide services directly.
 */
export function buildArcGisGeoJsonPageUrl(
  sourceId: GravelAtlasOfficialSourceId,
  offset: number,
  recordCount: number
): string {
  if (!Number.isInteger(offset) || offset < 0) throw new Error("ArcGIS page offset must be a non-negative integer")
  if (!Number.isInteger(recordCount) || recordCount < 1) throw new Error("ArcGIS page size must be a positive integer")

  const policy = GRAVEL_ATLAS_SOURCE_POLICIES[sourceId]
  const boundedCount = Math.min(recordCount, 2_000)
  const url = new URL(`${policy.serviceUrl}/query`)
  url.searchParams.set("where", policy.where)
  url.searchParams.set("outFields", policy.outFields.join(","))
  url.searchParams.set("returnGeometry", "true")
  url.searchParams.set("outSR", "4326")
  url.searchParams.set("orderByFields", "OBJECTID")
  url.searchParams.set("resultOffset", String(offset))
  url.searchParams.set("resultRecordCount", String(boundedCount))
  url.searchParams.set("f", "geojson")
  return url.toString()
}
