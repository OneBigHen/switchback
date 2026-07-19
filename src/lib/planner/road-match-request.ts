import { routePointsFromSketch } from "@/lib/planner/route-sketch"
import type { TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"

export interface RoadMatchPoints {
  start: Waypoint
  finish: Waypoint
  via: Waypoint[]
}

export interface RoadMatchRequest {
  points: RoadMatchPoints
  request: TripPlanRequest
}

export function buildRoadMatchRequest(route: PlannedRoute): RoadMatchRequest {
  const first = route.geometry[0]
  const last = route.geometry.at(-1)
  if (!first || !last) throw new Error("This track has no line to match.")
  const sketchPoints = routePointsFromSketch({
    mode: "destination",
    start: { lat: first[1], lon: first[0], label: route.waypoints[0]?.label ?? "Imported start" },
    finish: { lat: last[1], lon: last[0], label: route.waypoints.at(-1)?.label ?? "Imported finish" },
    trace: route.geometry.map(([lon, lat]) => ({ lat, lon }))
  })
  if (!sketchPoints.finish) throw new Error("This track has no finish to match.")
  const points: RoadMatchPoints = {
    start: sketchPoints.start,
    finish: sketchPoints.finish,
    via: sketchPoints.via
  }
  return {
    points,
    request: {
      profile: route.profile,
      compare: false,
      points: [points.start, ...points.via, points.finish],
      ...(route.avoidHighways ? { avoidHighways: true } : {}),
      ...(route.avoidAreas?.length ? {
        avoidAreas: route.avoidAreas.map((area) => ({ ...area, polygon: [...area.polygon] }))
      } : {})
    }
  }
}
