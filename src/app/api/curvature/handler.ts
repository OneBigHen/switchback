import type {
  CurvatureBounds,
  CurvatureSegment
} from "@/lib/curvature/repository"
import { curvatureFeatureCollection } from "@/lib/curvature/repository"
import { coerceNumber, object_, withDefault, safeParse, ValidationError } from "@/lib/validate"

const boundsSchema = object_({
  south: coerceNumber({ finite: true, min: -90, max: 90 }),
  west: coerceNumber({ finite: true, min: -180, max: 180 }),
  north: coerceNumber({ finite: true, min: -90, max: 90 }),
  east: coerceNumber({ finite: true, min: -180, max: 180 }),
  minScore: withDefault(coerceNumber({ finite: true, min: 0, max: 10_000 }), 650),
  limit: withDefault(coerceNumber({ finite: true, int: true, min: 1, max: 2_000 }), 500)
})

function validateBounds(data: { south: number; west: number; north: number; east: number }): void {
  if (data.south >= data.north || data.west >= data.east) {
    throw new ValidationError("The map bounds are inverted.")
  }
  if (data.north - data.south > 5 || data.east - data.west > 5) {
    throw new ValidationError("Zoom in to inspect curvy roads.")
  }
}

export interface CurvatureReader {
  queryBounds(bounds: CurvatureBounds): CurvatureSegment[]
}

export async function handleCurvatureRequest(
  request: Request,
  repository: CurvatureReader
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams
  const parsed = safeParse(boundsSchema, {
    south: searchParams.get("south"),
    west: searchParams.get("west"),
    north: searchParams.get("north"),
    east: searchParams.get("east"),
    minScore: searchParams.get("minScore") ?? undefined,
    limit: searchParams.get("limit") ?? undefined
  })
  if (!parsed.success || (() => { try { validateBounds(parsed.data); return false } catch { return true } })()) {
    const message = !parsed.success
      ? parsed.error.message
      : "Invalid map bounds."
    return Response.json(
      { error: { code: "INVALID_CURVATURE_BOUNDS", message } },
      { status: 400 }
    )
  }
  validateBounds(parsed.data)

  try {
    return Response.json(curvatureFeatureCollection(repository.queryBounds(parsed.data)))
  } catch {
    return Response.json(
      {
        error: {
          code: "CURVATURE_DATA_UNAVAILABLE",
          message: "Curvy-road data is not available for this map view."
        }
      },
      { status: 503 }
    )
  }
}
