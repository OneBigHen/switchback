import { featureMapLayerIds, type RiderLayerId } from "@/lib/client/map-layers"
import type { MapFeatureRequest, RiderFeatureCollection } from "@/lib/map-features/osm"
import { coerceNumber, tuple, safeParse } from "@/lib/validate"

const featureLayerSet = new Set<string>(featureMapLayerIds)
const bboxSchema = tuple([
  coerceNumber({ finite: true, min: -180, max: 180 }),
  coerceNumber({ finite: true, min: -90, max: 90 }),
  coerceNumber({ finite: true, min: -180, max: 180 }),
  coerceNumber({ finite: true, min: -90, max: 90 })
])

export type RiderMapFeatureProvider = (request: MapFeatureRequest) => Promise<RiderFeatureCollection>

export async function handleMapFeaturesRequest(
  request: Request,
  provider: RiderMapFeatureProvider
): Promise<Response> {
  const search = new URL(request.url).searchParams
  const parsedBounds = safeParse(bboxSchema, (search.get("bbox") ?? "").split(","))
  const layers = Array.from(new Set((search.get("layers") ?? "").split(",").filter(Boolean)))
  const unsupported = layers.some((layer) => !featureLayerSet.has(layer))
  if (!parsedBounds.success || layers.length === 0 || layers.length > featureMapLayerIds.length || unsupported) {
    return Response.json({ error: { code: "INVALID_MAP_FEATURE_REQUEST", message: "Choose a bounded map view and supported map layers." } }, { status: 400 })
  }
  const [west, south, east, north] = parsedBounds.data
  if (west >= east || south >= north || east - west > 3 || north - south > 2) {
    return Response.json({ error: { code: "INVALID_MAP_FEATURE_REQUEST", message: "Zoom in before loading map layers." } }, { status: 400 })
  }
  try {
    const collection = await provider({
      bounds: { west, south, east, north },
      layers: layers as RiderLayerId[]
    })
    return Response.json(collection, { headers: { "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600" } })
  } catch {
    return Response.json({ error: { code: "MAP_FEATURES_UNAVAILABLE", message: "The selected map layers are temporarily unavailable." } }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
