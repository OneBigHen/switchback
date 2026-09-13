import type { Feature, FeatureCollection, LineString } from "geojson";
import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
} from "maplibre-gl";
import type { Coordinate } from "@/lib/routing/types";
import type { ReconTrack } from "@/features/recon/types";
import { gravelEvidenceLinePaint } from "../map/recon-map-style";

/**
 * Gravel evidence: where the existing OpenGravel Gravel Atlas actually
 * crosses the selected track.
 *
 * Truth rules for this layer:
 * - Corridors come only from the existing map-features API (`gravel-atlas`
 *   layer), never from name matching, looks, or inference.
 * - A corridor is drawn only when its geometry runs within the tolerance
 *   below of the selected track, so the map shows evidence where it exists
 *   and nothing where it does not. Unknown surface stays unknown.
 * - An API failure or an over-large track yields empty evidence with
 *   `hasEvidence: false` — an honest "no evidence shown", never a claim
 *   that the route is paved, and never an error surface.
 */

export const RECON_EVIDENCE_SOURCE = "recon-evidence";

/**
 * Just above the Atlas' own 20 m route-match radius (see
 * src/lib/roads/gravel-atlas/route-evidence.ts), so display and evidence
 * arithmetic agree about what "crosses" means.
 */
export const EVIDENCE_PROXIMITY_METERS = 30;

/**
 * The map-features API rejects bounding boxes wider than 3° of longitude or
 * 2° of latitude. A longer track cannot ask for evidence without splitting
 * the request; V1 skips it rather than inventing a tiling scheme, and the
 * HUD simply shows no evidence line.
 */
const MAX_BBOX_SPAN_DEGREES = { longitude: 3, latitude: 2 } as const;

/**
 * Proximity sampling cap: a raw recorded ride can carry thousands of GPS
 * vertices. Comparing every corridor vertex against every track vertex is
 * presentation arithmetic, not observed data, so it runs on a deterministic
 * decimation (endpoints always kept) of the track geometry.
 */
const MAX_PROXIMITY_SAMPLES = 400;

const EARTH_RADIUS_METERS = 6_371_000;

export type GravelEvidenceCollection = FeatureCollection<LineString>;

export interface GravelEvidence {
  collection: GravelEvidenceCollection;
  /** True only when at least one Atlas corridor actually runs near the track. */
  hasEvidence: boolean;
}

export function gravelEvidenceSourceSpec(): GeoJSONSourceSpecification {
  return { type: "geojson", data: emptyEvidenceCollection() };
}

export function gravelEvidenceLayerSpecs(): LayerSpecification[] {
  return [
    {
      id: "recon-evidence-line",
      type: "line",
      source: RECON_EVIDENCE_SOURCE,
      paint: gravelEvidenceLinePaint(),
    },
  ];
}

export function emptyEvidenceCollection(): GravelEvidenceCollection {
  return { type: "FeatureCollection", features: [] };
}

export function emptyEvidence(): GravelEvidence {
  return { collection: emptyEvidenceCollection(), hasEvidence: false };
}

/**
 * Fetch Atlas corridors around the track and keep only those that actually
 * run within `EVIDENCE_PROXIMITY_METERS` of it. Any failure resolves to
 * empty evidence: evidence display never becomes an error surface.
 */
export async function fetchGravelEvidence(
  track: ReconTrack,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<GravelEvidence> {
  const bounds = trackBounds(track.geometry.coordinates);
  if (!bounds) return emptyEvidence();
  if (
    bounds.east - bounds.west > MAX_BBOX_SPAN_DEGREES.longitude ||
    bounds.north - bounds.south > MAX_BBOX_SPAN_DEGREES.latitude
  ) {
    // Too large a view for one evidence request; show nothing rather than
    // claim anything about surfaces along the whole ride.
    return emptyEvidence();
  }

  const query = new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    layers: "gravel-atlas",
  });
  const response = await fetcher(`/api/map-features?${query.toString()}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) return emptyEvidence();

  const corridors = parseCorridorFeatures(await response.json());
  const samples = decimateForProximity(track.geometry.coordinates);
  const near = corridors.filter((feature) =>
    featureNearTrack(feature, samples),
  );
  if (near.length === 0) return emptyEvidence();
  return {
    collection: { type: "FeatureCollection", features: near },
    hasEvidence: true,
  };
}

/** Parse the API payload into LineString corridor features, fail closed. */
function parseCorridorFeatures(body: unknown): Feature<LineString>[] {
  if (!body || typeof body !== "object") return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const parsed: Feature<LineString>[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as { geometry?: unknown; properties?: unknown };
    const geometry = record.geometry as { type?: unknown; coordinates?: unknown } | undefined;
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
      continue;
    }
    const properties =
      record.properties && typeof record.properties === "object"
        ? (record.properties as Record<string, unknown>)
        : {};
    if (properties.layerId !== undefined && properties.layerId !== "gravel-atlas") {
      continue;
    }
    parsed.push({
      type: "Feature",
      properties: { name: String(properties.name ?? "gravel-atlas") },
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates as Coordinate[],
      },
    });
  }
  return parsed;
}

/** Deterministic decimation that always keeps both endpoints. */
function decimateForProximity(coordinates: Coordinate[]): Coordinate[] {
  if (coordinates.length <= MAX_PROXIMITY_SAMPLES) return coordinates;
  const step = (coordinates.length - 1) / (MAX_PROXIMITY_SAMPLES - 1);
  const samples: Coordinate[] = [];
  for (let index = 0; index < MAX_PROXIMITY_SAMPLES; index += 1) {
    samples.push(coordinates[Math.round(index * step)]!);
  }
  return samples;
}

function featureNearTrack(
  feature: Feature<LineString>,
  samples: Coordinate[],
): boolean {
  for (const coordinate of feature.geometry.coordinates as Coordinate[]) {
    for (const sample of samples) {
      if (metersBetween(coordinate, sample) <= EVIDENCE_PROXIMITY_METERS) {
        return true;
      }
    }
  }
  return false;
}

function metersBetween(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeArc = toRadians(b[1]! - a[1]!);
  const longitudeArc = toRadians(b[0]! - a[0]!);
  const latitudeH = Math.sin(latitudeArc / 2) ** 2;
  const longitudeH = Math.sin(longitudeArc / 2) ** 2;
  const h = latitudeH + Math.cos(toRadians(a[1]!)) * Math.cos(toRadians(b[1]!)) * longitudeH;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function trackBounds(coordinates: Coordinate[]): {
  west: number;
  south: number;
  east: number;
  north: number;
} | null {
  if (coordinates.length < 2) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude!);
    east = Math.max(east, longitude!);
    south = Math.min(south, latitude!);
    north = Math.max(north, latitude!);
  }
  return { west, south, east, north };
}
