import type { Feature, FeatureCollection, LineString, Point } from "geojson"
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl"
import type { Coordinate } from "@/lib/routing/types"
import type { ExplorationSegment, ReconTrack } from "@/features/recon/types"
import { cumulativeDistancesMeters } from "@/features/recon/data/recon-track"
import { RECON_COLORS } from "./recon-map-style"

/**
 * Every MapLibre layer Recon draws, bottom→top: gravel evidence, ride history,
 * then the selected ride (glow, casing, line split by new-to-you status,
 * endpoints). The selection is always the strongest thing on screen; history
 * stays thin and quiet; evidence is golden-hour dashes under everything.
 */

const EVIDENCE = "recon-evidence"
const HISTORY = "recon-history"
const SELECTED = "recon-selected"

type Collection = FeatureCollection<LineString | Point>

const empty = (): Collection => ({ type: "FeatureCollection", features: [] })

const byZoom = (low: number, high: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 8, low, 15, high]

export const RECON_FIRST_ROUTE_LAYER = "recon-evidence-line"

export function addReconLayers(map: MapLibreMap): void {
  map.addSource(EVIDENCE, { type: "geojson", data: empty() })
  map.addSource(HISTORY, { type: "geojson", data: empty() })
  map.addSource(SELECTED, { type: "geojson", data: empty(), lineMetrics: true })
  const layers: LayerSpecification[] = [
    {
      id: RECON_FIRST_ROUTE_LAYER,
      type: "line",
      source: EVIDENCE,
      layout: { "line-cap": "round" },
      paint: { "line-color": RECON_COLORS.golden, "line-opacity": 0.95, "line-width": byZoom(2.5, 6), "line-dasharray": [2, 1.5] }
    },
    {
      id: "recon-history-line",
      type: "line",
      source: HISTORY,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": RECON_COLORS.spruce, "line-opacity": 0.55, "line-width": byZoom(1.5, 3) }
    },
    {
      id: "recon-selected-glow",
      type: "line",
      source: SELECTED,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": RECON_COLORS.ember, "line-opacity": 0.28, "line-blur": 10, "line-width": byZoom(14, 30) }
    },
    {
      id: "recon-selected-casing",
      type: "line",
      source: SELECTED,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": RECON_COLORS.paper, "line-opacity": 0.9, "line-width": byZoom(6, 11) }
    },
    {
      id: "recon-selected-line",
      type: "line",
      source: SELECTED,
      filter: ["all", ["==", ["get", "kind"], "line"], ["==", ["get", "playbackKind"], "recorded"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "status"], "previously-ridden", RECON_COLORS.moss, RECON_COLORS.ember],
        "line-width": byZoom(3.5, 7)
      }
    },
    {
      // line-dasharray cannot be data-driven, so previews get their own layer.
      id: "recon-selected-preview",
      type: "line",
      source: SELECTED,
      filter: ["all", ["==", ["get", "kind"], "line"], ["==", ["get", "playbackKind"], "preview"]],
      layout: { "line-join": "round" },
      paint: { "line-color": RECON_COLORS.signal, "line-width": byZoom(3.5, 7), "line-dasharray": [1.4, 1.2] }
    },
    {
      id: "recon-selected-endpoints",
      type: "circle",
      source: SELECTED,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": byZoom(4, 7),
        "circle-color": ["match", ["get", "kind"], "start", RECON_COLORS.paper, RECON_COLORS.ink],
        "circle-stroke-color": ["match", ["get", "kind"], "start", RECON_COLORS.ember, RECON_COLORS.paper],
        "circle-stroke-width": 2.5,
        "circle-pitch-alignment": "map"
      }
    }
  ]
  for (const layer of layers) map.addLayer(layer)
}

function setData(map: MapLibreMap, source: string, data: Collection): void {
  ;(map.getSource(source) as GeoJSONSource | undefined)?.setData(data)
}

export function setEvidence(map: MapLibreMap, lines: ReadonlyArray<ReadonlyArray<Coordinate>> | null): void {
  setData(map, EVIDENCE, {
    type: "FeatureCollection",
    features: (lines ?? []).map((coordinates) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coordinates.map((coordinate) => [...coordinate]) }
    }))
  })
}

export function setHistory(map: MapLibreMap, tracks: readonly ReconTrack[]): void {
  setData(map, HISTORY, {
    type: "FeatureCollection",
    features: tracks.map((track) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: track.geometry.coordinates }
    }))
  })
}

/** The selected track, split into one feature per exploration run. */
export function setSelected(map: MapLibreMap, track: ReconTrack | null, segments: readonly ExplorationSegment[] | null): void {
  if (!track) return setData(map, SELECTED, empty())
  const coordinates = track.geometry.coordinates
  const lines: Feature<LineString>[] =
    track.playbackKind === "recorded" && segments && segments.length > 0
      ? splitBySegments(coordinates, segments).map(({ coordinates: part, status }) => ({
          type: "Feature",
          properties: { kind: "line", playbackKind: "recorded", status },
          geometry: { type: "LineString", coordinates: part }
        }))
      : [
          {
            type: "Feature",
            properties: { kind: "line", playbackKind: track.playbackKind, status: "new-to-you" },
            geometry: { type: "LineString", coordinates }
          }
        ]
  const endpoint = (kind: "start" | "end", coordinate: Coordinate): Feature<Point> => ({
    type: "Feature",
    properties: { kind },
    geometry: { type: "Point", coordinates: coordinate }
  })
  setData(map, SELECTED, {
    type: "FeatureCollection",
    features: [...lines, endpoint("start", coordinates[0]!), endpoint("end", coordinates[coordinates.length - 1]!)]
  })
}

/** Cuts a polyline at segment boundaries (by distance), sharing boundary vertices. */
export function splitBySegments(
  coordinates: readonly Coordinate[],
  segments: readonly ExplorationSegment[]
): Array<{ coordinates: Coordinate[]; status: ExplorationSegment["status"] }> {
  const cumulative = cumulativeDistancesMeters(coordinates)
  const parts: Array<{ coordinates: Coordinate[]; status: ExplorationSegment["status"] }> = []
  let vertex = 0
  for (const segment of segments) {
    const part: Coordinate[] = [interpolate(coordinates, cumulative, segment.fromMeters)]
    while (vertex < coordinates.length && cumulative[vertex]! <= segment.fromMeters) vertex += 1
    let index = vertex
    while (index < coordinates.length && cumulative[index]! < segment.toMeters) {
      part.push(coordinates[index]!)
      index += 1
    }
    part.push(interpolate(coordinates, cumulative, segment.toMeters))
    if (part.length >= 2) parts.push({ coordinates: part, status: segment.status })
  }
  return parts
}

function interpolate(coordinates: readonly Coordinate[], cumulative: readonly number[], meters: number): Coordinate {
  let index = 0
  while (index < cumulative.length - 2 && cumulative[index + 1]! < meters) index += 1
  const span = cumulative[index + 1]! - cumulative[index]!
  const t = span > 0 ? Math.min(1, Math.max(0, (meters - cumulative[index]!) / span)) : 0
  const a = coordinates[index]!
  const b = coordinates[index + 1] ?? a
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/**
 * In Replay the full ride is the quiet "road ahead" under the moving trail;
 * in the Explorer it is the loudest thing on screen.
 */
export function setSelectedEmphasis(map: MapLibreMap, emphasis: "focus" | "ahead"): void {
  const ahead = emphasis === "ahead"
  const paint = (layer: string, property: "line-opacity" | "line-color", value: number | string | ExpressionSpecification) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value)
  }
  paint("recon-selected-glow", "line-opacity", ahead ? 0 : 0.28)
  paint("recon-selected-casing", "line-opacity", ahead ? 0.55 : 0.9)
  // Ahead of the rider the road is neutral ink; deck.gl paints the ridden trail.
  paint("recon-selected-line", "line-color", ahead ? RECON_COLORS.ink : ["match", ["get", "status"], "previously-ridden", RECON_COLORS.moss, RECON_COLORS.ember])
  paint("recon-selected-line", "line-opacity", ahead ? 0.5 : 1)
  paint("recon-selected-preview", "line-opacity", ahead ? 0.55 : 1)
}
