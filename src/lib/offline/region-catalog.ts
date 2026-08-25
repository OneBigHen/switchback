import type { Coordinate } from "@/lib/routing/types"

/** A single region available for offline graph download. */
export interface OfflineRegion {
  /** Stable slug, e.g. "pennsylvania", "new-jersey". */
  id: string
  /** Human-readable name, e.g. "Pennsylvania". */
  name: string
  /** Abbreviation for compact UI, e.g. "PA". */
  code: string
  /** ISO 3166-2 region code if applicable, for interoperability. */
  isoCode: string | null
  /** Stable endpoint that resolves the currently active immutable tile inventory. */
  manifestUrl: string
  /** Human-readable URL for attribution. */
  sourceUrl: string
  /** Bounding box of the region in geographic coordinates. */
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  /** Approximate download size of the tile bundle in bytes. */
  estimatedDownloadBytes: number
  /** Approximate count of graph nodes in this region. */
  estimatedNodeCount: number
  /** Approximate count of graph edges in this region. */
  estimatedEdgeCount: number
}

/** Regions eligible for offline download. Built from Geofabrik US extracts. */
export const OFFLINE_REGIONS: readonly OfflineRegion[] = [
  {
    id: "pennsylvania",
    name: "Pennsylvania",
    code: "PA",
    isoCode: "US-PA",
    manifestUrl: "/api/offline/regions/pennsylvania/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/pennsylvania.html",
    bounds: { minLon: -80.52, minLat: 39.72, maxLon: -74.69, maxLat: 42.27 },
    estimatedDownloadBytes: 120_000_000,
    estimatedNodeCount: 1_200_000,
    estimatedEdgeCount: 2_800_000,
  },
  {
    id: "new-jersey",
    name: "New Jersey",
    code: "NJ",
    isoCode: "US-NJ",
    manifestUrl: "/api/offline/regions/new-jersey/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/new-jersey.html",
    bounds: { minLon: -75.56, minLat: 38.93, maxLon: -73.89, maxLat: 41.36 },
    estimatedDownloadBytes: 45_000_000,
    estimatedNodeCount: 450_000,
    estimatedEdgeCount: 1_050_000,
  },
  {
    id: "new-york",
    name: "New York",
    code: "NY",
    isoCode: "US-NY",
    manifestUrl: "/api/offline/regions/new-york/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/new-york.html",
    bounds: { minLon: -79.76, minLat: 40.50, maxLon: -71.86, maxLat: 45.01 },
    estimatedDownloadBytes: 180_000_000,
    estimatedNodeCount: 1_800_000,
    estimatedEdgeCount: 4_200_000,
  },
  {
    id: "maryland",
    name: "Maryland",
    code: "MD",
    isoCode: "US-MD",
    manifestUrl: "/api/offline/regions/maryland/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/maryland.html",
    bounds: { minLon: -79.49, minLat: 37.89, maxLon: -75.05, maxLat: 39.72 },
    estimatedDownloadBytes: 32_000_000,
    estimatedNodeCount: 320_000,
    estimatedEdgeCount: 750_000,
  },
  {
    id: "delaware",
    name: "Delaware",
    code: "DE",
    isoCode: "US-DE",
    manifestUrl: "/api/offline/regions/delaware/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/delaware.html",
    bounds: { minLon: -75.79, minLat: 38.45, maxLon: -74.98, maxLat: 39.84 },
    estimatedDownloadBytes: 6_000_000,
    estimatedNodeCount: 60_000,
    estimatedEdgeCount: 140_000,
  },
  {
    id: "west-virginia",
    name: "West Virginia",
    code: "WV",
    isoCode: "US-WV",
    manifestUrl: "/api/offline/regions/west-virginia/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/west-virginia.html",
    bounds: { minLon: -82.64, minLat: 37.20, maxLon: -77.72, maxLat: 40.64 },
    estimatedDownloadBytes: 85_000_000,
    estimatedNodeCount: 850_000,
    estimatedEdgeCount: 2_000_000,
  },
  {
    id: "virginia",
    name: "Virginia",
    code: "VA",
    isoCode: "US-VA",
    manifestUrl: "/api/offline/regions/virginia/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/virginia.html",
    bounds: { minLon: -83.68, minLat: 36.54, maxLon: -75.24, maxLat: 39.47 },
    estimatedDownloadBytes: 140_000_000,
    estimatedNodeCount: 1_400_000,
    estimatedEdgeCount: 3_300_000,
  },
  {
    id: "ohio",
    name: "Ohio",
    code: "OH",
    isoCode: "US-OH",
    manifestUrl: "/api/offline/regions/ohio/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/ohio.html",
    bounds: { minLon: -84.82, minLat: 38.40, maxLon: -80.52, maxLat: 42.00 },
    estimatedDownloadBytes: 140_000_000,
    estimatedNodeCount: 1_400_000,
    estimatedEdgeCount: 3_300_000,
  },
  {
    id: "vermont",
    name: "Vermont",
    code: "VT",
    isoCode: "US-VT",
    manifestUrl: "/api/offline/regions/vermont/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/vermont.html",
    bounds: { minLon: -73.44, minLat: 42.73, maxLon: -71.47, maxLat: 45.02 },
    estimatedDownloadBytes: 28_000_000,
    estimatedNodeCount: 280_000,
    estimatedEdgeCount: 650_000,
  },
  {
    id: "north-carolina",
    name: "North Carolina",
    code: "NC",
    isoCode: "US-NC",
    manifestUrl: "/api/offline/regions/north-carolina/manifest",
    sourceUrl: "https://download.geofabrik.de/north-america/us/north-carolina.html",
    bounds: { minLon: -84.32, minLat: 33.84, maxLon: -75.46, maxLat: 36.59 },
    estimatedDownloadBytes: 170_000_000,
    estimatedNodeCount: 1_700_000,
    estimatedEdgeCount: 4_000_000,
  }
]

/** Suggested regions for a route, based on its waypoint coverage. */
export function suggestRegionsForRoute(coords: Coordinate[]): OfflineRegion[] {
  const regionScores = new Map<string, { region: OfflineRegion; score: number }>()
  for (const coord of coords) {
    for (const region of OFFLINE_REGIONS) {
      const [lon, lat] = coord
      if (
        lon >= region.bounds.minLon &&
        lon <= region.bounds.maxLon &&
        lat >= region.bounds.minLat &&
        lat <= region.bounds.maxLat
      ) {
        const entry = regionScores.get(region.id)
        if (entry) {
          entry.score++
        } else {
          regionScores.set(region.id, { region, score: 1 })
        }
      }
    }
  }
  return [...regionScores.values()]
    .sort((a, b) => b.score - a.score)
    .map((e) => e.region)
}

/** Format bytes for human display. */
export function formatRegionBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}
