import { handleMapFeaturesRequest } from "./handler"
import { getRiderMapFeatures } from "@/lib/map-features/osm"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return handleMapFeaturesRequest(request, (featureRequest) => getRiderMapFeatures(featureRequest, {
    overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
    nwsUserAgent: process.env.NWS_USER_AGENT ?? "Switchback route planner (map alerts)"
  }))
}
