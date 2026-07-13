import type {
  CurvatureBounds,
  CurvatureSegment
} from "@/lib/curvature/repository"
import { curvatureFeatureCollection } from "@/lib/curvature/repository"
import { z } from "zod"

const boundsSchema = z.object({
  south: z.coerce.number().finite().min(-90).max(90),
  west: z.coerce.number().finite().min(-180).max(180),
  north: z.coerce.number().finite().min(-90).max(90),
  east: z.coerce.number().finite().min(-180).max(180),
  minScore: z.coerce.number().finite().min(0).max(10_000).default(650),
  limit: z.coerce.number().int().min(1).max(2_000).default(500)
}).superRefine((bounds, context) => {
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) {
    context.addIssue({ code: "custom", message: "The map bounds are inverted." })
  }
  if (bounds.north - bounds.south > 5 || bounds.east - bounds.west > 5) {
    context.addIssue({ code: "custom", message: "Zoom in to inspect curvy roads." })
  }
})

export interface CurvatureReader {
  queryBounds(bounds: CurvatureBounds): CurvatureSegment[]
}

export async function handleCurvatureRequest(
  request: Request,
  repository: CurvatureReader
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams
  const parsed = boundsSchema.safeParse({
    south: searchParams.get("south"),
    west: searchParams.get("west"),
    north: searchParams.get("north"),
    east: searchParams.get("east"),
    minScore: searchParams.get("minScore") ?? undefined,
    limit: searchParams.get("limit") ?? undefined
  })
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "INVALID_CURVATURE_BOUNDS",
          message: parsed.error.issues[0]?.message ?? "Invalid map bounds."
        }
      },
      { status: 400 }
    )
  }

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
