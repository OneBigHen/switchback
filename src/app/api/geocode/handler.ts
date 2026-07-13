import type { PlaceResult } from "@/lib/geocoding/photon"

export type PlaceSearcher = (query: string) => Promise<PlaceResult[]>

export async function handleGeocodeRequest(
  request: Request,
  searcher: PlaceSearcher
): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (query.length < 2) {
    return Response.json({ places: [] })
  }

  try {
    return Response.json({ places: await searcher(query) })
  } catch (error) {
    const status = readErrorStatus(error)
    const code = readErrorCode(error)
    const message = error instanceof Error ? error.message : "Place search failed."
    return Response.json({ error: { code, message } }, { status })
  }
}

function readErrorStatus(error: unknown): number {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number(error.status)
    if (status >= 400 && status <= 599) return status
  }
  return 503
}

function readErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code)
  }
  return "GEOCODER_UNAVAILABLE"
}
