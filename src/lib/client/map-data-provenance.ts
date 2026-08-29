import { type DataCategory, type RiderLayerDefinition, type RiderLayerId, layerCatalog } from "@/lib/client/map-layers"

export interface ProvenanceSummary {
  layers: number
  live: number
  regional: number
  planned: number
  authoritative: number
  heuristic: number
  byCategory: Record<DataCategory, number>
}

export interface ProvenanceRecord {
  id: RiderLayerId
  name: string
  provenance: string
  dataCategory: DataCategory
  approximate: boolean
}

export interface ProvenanceVerification {
  valid: boolean
  missing: RiderLayerId[]
  emptyProvenance: RiderLayerId[]
  unknownCategory: { id: RiderLayerId; value: string }[]
}

const APPROXIMATE_TRIGGERS = [
  "not ground-truthed",
  "approximate",
  "heuristic",
  "community-mapped",
  "community-reported",
  "community-maintained",
  "not a legal",
  "not parcel",
  "not real-time",
  "not a live",
  "not a coverage guarantee",
  "may have already",
  "not tracked",
  "call ahead",
  "verify",
  "confirm"
]

const AUTHORITATIVE_TRIGGERS = [
  "Government-published",
  "NOAA public",
  "National Weather Service",
  "USGS National Map",
  "official",
  "public domain"
]

export function provenanceRecord(layer: RiderLayerDefinition): ProvenanceRecord {
  const isAuthoritative = AUTHORITATIVE_TRIGGERS.some((trigger) =>
    layer.provenance.includes(trigger)
  )
  const approximate = isAuthoritative
    ? false
    : APPROXIMATE_TRIGGERS.some((trigger) =>
        layer.provenance.toLowerCase().includes(trigger.toLowerCase())
      )
  return {
    id: layer.id,
    name: layer.name,
    provenance: layer.provenance,
    dataCategory: layer.dataCategory,
    approximate
  }
}

export function allProvenanceRecords(): ProvenanceRecord[] {
  return layerCatalog.map(provenanceRecord)
}

export function provenanceForLayer(id: RiderLayerId): ProvenanceRecord | null {
  const layer = layerCatalog.find((entry) => entry.id === id)
  return layer ? provenanceRecord(layer) : null
}

export function provenanceSummary(): ProvenanceSummary {
  const records = allProvenanceRecords()
  const byCategory = {} as Record<DataCategory, number>
  let authoritative = 0
  let heuristic = 0

  for (const record of records) {
    byCategory[record.dataCategory] = (byCategory[record.dataCategory] ?? 0) + 1
    if (!record.approximate) authoritative++
    else heuristic++
  }

  return {
    layers: records.length,
    live: layerCatalog.filter((layer) => layer.status === "live").length,
    regional: layerCatalog.filter((layer) => layer.status === "regional").length,
    planned: layerCatalog.filter((layer) => layer.status === "planned").length,
    authoritative,
    heuristic,
    byCategory
  }
}

const VALID_DATA_CATEGORIES: Set<string> = new Set([
  "road-geometry",
  "road-surface",
  "basemap-imagery",
  "basemap-topo",
  "basemap-terrain",
  "access-boundary",
  "access-mvum",
  "conditions-construction",
  "conditions-traffic",
  "conditions-weather",
  "conditions-connectivity",
  "services-fuel",
  "services-food",
  "services-camping",
  "services-lodging",
  "services-repair"
])

export function verifyProvenance(): ProvenanceVerification {
  const missing: RiderLayerId[] = []
  const emptyProvenance: RiderLayerId[] = []
  const unknownCategory: { id: RiderLayerId; value: string }[] = []

  for (const layer of layerCatalog) {
    if (!layer.provenance || layer.provenance.trim().length === 0) {
      emptyProvenance.push(layer.id)
    }
    if (!VALID_DATA_CATEGORIES.has(layer.dataCategory)) {
      unknownCategory.push({ id: layer.id, value: layer.dataCategory })
    }
  }

  const allCatalogIds = new Set(layerCatalog.map((layer) => layer.id))
  const allDefinedIds = new Set<RiderLayerId>([
    "curvature", "unpaved", "topo", "satellite", "terrain",
    "public-land", "private-land", "mvum", "closures", "road-controls",
    "weather", "fuel", "food", "camping", "lodging", "repair",
    "cell-coverage"
  ])
  for (const id of allDefinedIds) {
    if (!allCatalogIds.has(id)) missing.push(id)
  }

  return {
    valid: emptyProvenance.length === 0 && unknownCategory.length === 0 && missing.length === 0,
    missing,
    emptyProvenance,
    unknownCategory
  }
}
