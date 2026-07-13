export interface CurvatureBounds {
  south: number
  west: number
  north: number
  east: number
  minScore: number
  limit: number
}

export interface CurvatureSegment {
  id: string
  name: string
  score: number
  surface: string
  geometry: [number, number][]
}

export class CurvatureRepository {
  constructor(readonly databasePath: string) {}

  queryBounds(bounds: CurvatureBounds): CurvatureSegment[] {
    if (bounds.south >= bounds.north) {
      throw new Error("south must be less than north")
    }
    if (bounds.west >= bounds.east) {
      throw new Error("west must be less than east")
    }
    const limit = Math.max(1, Math.min(Math.floor(bounds.limit), 2_000))
    const database = new Database(this.databasePath, { readonly: true, fileMustExist: true })
    try {
      const rows = database.prepare(`
        select id, name, score, surface, geometry
        from segments indexed by idx_loc
        where mid_lat between ? and ?
          and mid_lon between ? and ?
          and score >= ?
        order by score desc
        limit ?
      `).all(
        bounds.south,
        bounds.north,
        bounds.west,
        bounds.east,
        bounds.minScore,
        limit
      ) as CurvatureRow[]

      return rows.flatMap((row) => {
        try {
          const geometry = JSON.parse(row.geometry) as [number, number][]
          if (!Array.isArray(geometry) || geometry.length < 2) return []
          return [{
            id: row.id,
            name: row.name || "Unnamed road",
            score: Number(row.score),
            surface: row.surface || "unknown",
            geometry
          }]
        } catch {
          return []
        }
      })
    } finally {
      database.close()
    }
  }
}

interface CurvatureRow {
  id: string
  name: string | null
  score: number
  surface: string | null
  geometry: string
}

export function curvatureFeatureCollection(segments: CurvatureSegment[]) {
  return {
    type: "FeatureCollection" as const,
    features: segments.map((segment) => ({
      type: "Feature" as const,
      properties: {
        id: segment.id,
        name: segment.name,
        curvature: segment.score,
        surface: segment.surface
      },
      geometry: {
        type: "LineString" as const,
        coordinates: segment.geometry
      }
    }))
  }
}
import Database from "better-sqlite3"
