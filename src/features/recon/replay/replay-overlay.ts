import { MapLibreOverlay } from "@deck.gl/maplibre"
import { PathLayer, ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers"
import type { Map as MapLibreMap } from "maplibre-gl"
import type { Coordinate } from "@/lib/routing/types"
import type { ExplorationSegment, ReconPlaybackKind } from "@/features/recon/types"
import { RECON_COLORS } from "@/features/recon/map/recon-map-style"
import type { DisplayPath } from "./replay-timeline"

/**
 * The deck.gl replay overlay, interleaved into the ONE MapLibre map: deck
 * draws through MapLibre's camera and depth buffer, so the trail sits on the
 * terrain with no second canvas and no second camera. This module is only
 * reached through a dynamic import, so the Explorer never loads deck.gl.
 *
 * MapLibre keeps the full ride as the dimmed "road ahead"; deck owns what
 * moves: the travelled trail (coloured by new-to-you status), the head and
 * the rider beacon. Layers are rebuilt per frame — deck diffs by id, and the
 * trail data is only replaced when the cut vertex actually advances.
 */

type Rgba = [number, number, number, number]

function rgba(hex: string, alpha = 255): Rgba {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha]
}

const EMBER = rgba(RECON_COLORS.ember)
const MOSS = rgba(RECON_COLORS.moss)
const SIGNAL = rgba(RECON_COLORS.signal)
const PAPER = rgba(RECON_COLORS.paper)
const HALO = rgba(RECON_COLORS.ember, 70)

interface TrailRun {
  path: Coordinate[]
  color: Rgba
}

export interface OverlayFrame {
  path: DisplayPath
  /** Last display vertex at or before the head. */
  cutIndex: number
  head: Coordinate
  bearing: number
  /** Distance along the ORIGINAL track per display vertex, for status lookup. */
  vertexMeters: readonly number[]
  segments: readonly ExplorationSegment[] | null
  playbackKind: ReconPlaybackKind
  /** Wall-clock ms, drives the beacon pulse (static under reduced motion). */
  nowMs: number
  reducedMotion: boolean
}

export interface ReplayOverlay {
  update(frame: OverlayFrame): void
  dispose(): void
}

function colorFor(meters: number, frame: OverlayFrame): Rgba {
  if (frame.playbackKind === "preview") return SIGNAL
  const segment = frame.segments?.find((candidate) => meters >= candidate.fromMeters && meters <= candidate.toMeters)
  return segment?.status === "previously-ridden" ? MOSS : EMBER
}

/**
 * Travelled trail as contiguous same-colour runs, ending exactly at the head.
 * `vertices` are the display vertices (optionally lifted to ground height).
 */
export function trailRuns(frame: OverlayFrame, vertices: readonly Coordinate[] = frame.path.coordinates): TrailRun[] {
  const { cutIndex } = frame
  const runs: TrailRun[] = []
  let current: TrailRun | null = null
  for (let index = 0; index <= cutIndex; index += 1) {
    const vertex = vertices[index]!
    const color = colorFor(frame.vertexMeters[index] ?? 0, frame)
    if (!current || current.color !== color) {
      // Share the boundary vertex so runs join without a visible seam.
      current = { path: current ? [current.path[current.path.length - 1]!] : [], color }
      runs.push(current)
    }
    current.path.push(vertex)
  }
  if (current) current.path.push(frame.head)
  return runs.filter((run) => run.path.length >= 2)
}

/** A wedge pointing along `bearing` (degrees clockwise from north). */
export function beaconWedge(head: Coordinate, bearing: number, sizeMeters: number): Coordinate[] {
  const radians = (bearing * Math.PI) / 180
  const north = Math.cos(radians)
  const east = Math.sin(radians)
  const metersPerLng = 111_320 * Math.max(0.05, Math.cos((head[1] * Math.PI) / 180))
  const at = (forward: number, right: number): Coordinate => [
    head[0] + (east * forward + north * right) / metersPerLng,
    head[1] + (north * forward - east * right) / 111_320
  ]
  return [at(sizeMeters, 0), at(-sizeMeters * 0.55, sizeMeters * 0.62), at(-sizeMeters * 0.25, 0), at(-sizeMeters * 0.55, -sizeMeters * 0.62)]
}

const ELEVATION_REFRESH_MS = 900

export function createReplayOverlay(map: MapLibreMap): ReplayOverlay {
  const overlay = new MapLibreOverlay({ interleaved: true, layers: [] })
  map.addControl(overlay)
  let trailKey = ""
  let runs: TrailRun[] = []
  let lifted: Coordinate[] = []
  let liftedPath: DisplayPath | null = null
  let liftedStamp = -Infinity

  // deck.gl draws z = 0 at sea level even when MapLibre terrain is on, so
  // every vertex is lifted to the ground height MapLibre is rendering. The
  // DEM streams in by zoom, so heights are re-read on a slow cadence.
  const ground = (coordinate: Coordinate): number => {
    try {
      return map.queryTerrainElevation(coordinate) ?? 0
    } catch {
      return 0
    }
  }
  const lift = (coordinate: Coordinate, z: number): Coordinate => [coordinate[0], coordinate[1], z] as unknown as Coordinate

  return {
    update(frame) {
      if (liftedPath !== frame.path || frame.nowMs - liftedStamp > ELEVATION_REFRESH_MS) {
        lifted = frame.path.coordinates.map((coordinate) => lift(coordinate, ground(coordinate)))
        liftedPath = frame.path
        liftedStamp = frame.nowMs
        trailKey = ""
      }
      const headZ = ground(frame.head)
      const head = lift(frame.head, headZ)
      const key = `${frame.cutIndex}|${frame.segments?.length ?? -1}|${frame.playbackKind}`
      if (key !== trailKey) {
        trailKey = key
        runs = trailRuns({ ...frame, head }, lifted)
      } else if (runs.length > 0) {
        // Only the head moved: swap the final vertex without rebuilding runs.
        const last = runs[runs.length - 1]!
        runs = [...runs.slice(0, -1), { ...last, path: [...last.path.slice(0, -1), head] }]
      }
      const zoom = map.getZoom()
      // Keep the beacon a readable size on screen at every zoom.
      const metersPerPixel = (78_271.52 * Math.cos((frame.head[1] * Math.PI) / 180)) / 2 ** zoom
      const pulse = frame.reducedMotion ? 0.5 : (Math.sin(frame.nowMs / 380) + 1) / 2
      overlay.setProps({
        layers: [
          new PathLayer<TrailRun>({
            id: "recon-trail-casing",
            data: runs,
            getPath: (run) => run.path,
            getColor: PAPER,
            getWidth: 11,
            widthUnits: "pixels",
            capRounded: true,
            jointRounded: true,
            parameters: { depthCompare: "always" }
          }),
          new PathLayer<TrailRun>({
            id: "recon-trail",
            data: runs,
            getPath: (run) => run.path,
            getColor: (run) => run.color,
            getWidth: 6.5,
            widthUnits: "pixels",
            capRounded: true,
            jointRounded: true,
            parameters: { depthCompare: "always" }
          }),
          new ScatterplotLayer<{ position: Coordinate }>({
            id: "recon-beacon-halo",
            data: [{ position: head }],
            getPosition: (d) => d.position,
            getRadius: 16 + pulse * 10,
            radiusUnits: "pixels",
            getFillColor: HALO,
            parameters: { depthCompare: "always" },
            updateTriggers: { getRadius: pulse }
          }),
          new SolidPolygonLayer<{ polygon: Coordinate[] }>({
            id: "recon-beacon",
            data: [{ polygon: beaconWedge(frame.head, frame.bearing, metersPerPixel * 13).map((vertex) => lift(vertex, headZ)) }],
            getPolygon: (d) => d.polygon,
            getFillColor: EMBER,
            parameters: { depthCompare: "always" }
          }),
          new ScatterplotLayer<{ position: Coordinate }>({
            id: "recon-beacon-core",
            data: [{ position: head }],
            getPosition: (d) => d.position,
            getRadius: 3.5,
            radiusUnits: "pixels",
            getFillColor: PAPER,
            stroked: true,
            getLineColor: EMBER,
            lineWidthUnits: "pixels",
            getLineWidth: 2,
            parameters: { depthCompare: "always" }
          })
        ]
      })
    },
    dispose() {
      try {
        map.removeControl(overlay)
      } catch {
        // The map was already removed.
      }
      overlay.finalize()
    }
  }
}
