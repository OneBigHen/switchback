import { MapboxOverlay } from "@deck.gl/maplibre";
import {
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
} from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Coordinate } from "@/lib/routing/types";
import type { ReconPlaybackKind } from "@/features/recon/types";
import type {
  ExplorationSegmentStatus,
} from "@/features/recon/types";
import {
  RECON_COLORS,
} from "../map/recon-map-style";
import type { ReconDisplayGeometry } from "../replay/replay-timeline";

/**
 * The deck.gl replay overlay, integrated with the ONE MapLibre map through
 * `MapboxOverlay` in interleaved mode: deck geometry participates in the
 * map's 3D depth ordering, and there is no second map camera — deck renders
 * through the MapLibre view state.
 *
 * Renderer responsibilities (run authority §8): MapLibre owns geography and
 * the route hierarchy — the focused view's existing selected-route layers
 * already draw the full ride, which reads as the *upcoming* stretch. deck
 * owns the replay animation layered on top: the travelled trail (cased, so
 * it separates from the MapLibre route line), the head connector, and the
 * current-position beacon.
 *
 * TripsLayer was evaluated and deliberately not used: its time-axis
 * semantics drive a fading trail, while Replay needs the full travelled
 * path to stay visible, coloured by exploration status per contiguous run;
 * previews have no time axis at all. Plain path layers driven by our own
 * timeline express both truthfully, for both playback kinds.
 */

/** Token hex mapped to deck RGBA; Recon never invents a colour. */
function rgba(hex: string, alpha = 255): [number, number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

const EMBER = rgba(RECON_COLORS.ember);
const MOSS = rgba(RECON_COLORS.moss);
const SIGNAL = rgba(RECON_COLORS.signal);
const PAPER = rgba(RECON_COLORS.paper);

const TRAIL_WIDTH = 7;
const TRAIL_CASING_WIDTH = 12;

/** Bead geometry for the directional beacon, in meters. */
const BEACON_TIP_METERS = 18;
const BEACON_BASE_METERS = 5;
const BEACON_HALF_WIDTH_METERS = 8;

export type ReplayVertexStatus = ExplorationSegmentStatus | null;

export interface ReplayHeadState {
  coordinate: Coordinate;
  bearingDegrees: number;
}

export interface ReplayVisualState {
  geometry: ReconDisplayGeometry;
  /** Decimated vertex index at or before the head. */
  cutIndex: number;
  head: ReplayHeadState;
  /**
   * Per-decimated-vertex exploration status, or null when there is no
   * recorded history to compare against — no claim is made.
   */
  vertexStatuses: readonly ReplayVertexStatus[] | null;
  playbackKind: ReconPlaybackKind;
}

interface TrailSegment {
  path: Coordinate[];
  color: [number, number, number, number];
}

function statusColor(
  status: ReplayVertexStatus,
  playbackKind: ReconPlaybackKind,
): [number, number, number, number] {
  if (status === "new-to-you") return EMBER;
  if (status === "previously-ridden") return MOSS;
  return playbackKind === "recorded" ? EMBER : SIGNAL;
}

/**
 * Travelled trail as contiguous, per-status path segments. Vertices
 * 0..cutIndex (plus the head, appended to the final run) are grouped by
 * status so a single PathLayer can carry the new-to-you / previously-ridden
 * distinction with honest per-run colours.
 */
export function travelledTrailData(
  state: ReplayVisualState,
): TrailSegment[] {
  const { geometry, cutIndex, vertexStatuses, playbackKind } = state;
  if (cutIndex < 0) return [];
  const segments: TrailSegment[] = [];
  let runStart = 0;
  let runStatus = vertexStatuses?.[0] ?? null;
  for (let index = 1; index <= cutIndex; index += 1) {
    const status = vertexStatuses?.[index] ?? null;
    if (status !== runStatus) {
      segments.push({
        path: geometry.coordinates.slice(runStart, index),
        color: statusColor(runStatus, playbackKind),
      });
      runStart = index;
      runStatus = status;
    }
  }
  if (cutIndex >= runStart) {
    segments.push({
      path: [...geometry.coordinates.slice(runStart, cutIndex + 1), [...state.head.coordinate] as Coordinate],
      color: statusColor(runStatus, playbackKind),
    });
  }
  return segments;
}

/** Two-point connector from the last trail vertex to the exact head. */
export function headConnectorData(state: ReplayVisualState): TrailSegment[] {
  const { geometry, cutIndex, head, vertexStatuses, playbackKind } = state;
  const anchor = geometry.coordinates[cutIndex];
  if (!anchor) return [];
  return [
    {
      path: [[...anchor] as Coordinate, [...head.coordinate] as Coordinate],
      color: statusColor(vertexStatuses?.[cutIndex] ?? null, playbackKind),
    },
  ];
}

/** Meters-to-degrees local conversion for beacon geometry. */
function metersOffset(
  origin: Coordinate,
  northMeters: number,
  eastMeters: number,
): Coordinate {
  const latRad = (origin[1] * Math.PI) / 180;
  return [
    origin[0] + eastMeters / (111_320 * Math.max(0.05, Math.cos(latRad))),
    origin[1] + northMeters / 111_320,
  ];
}

/**
 * The directional beacon: a triangle oriented by the direction of travel.
 * Deliberate and premium — the OpenGravel ember wedge floats on a paper
 * halo so it reads over any basemap, with no vehicle asset to fake.
 */
export function beaconPolygon(head: ReplayHeadState): Coordinate[] {
  const { coordinate, bearingDegrees } = head;
  const rad = (bearingDegrees * Math.PI) / 180;
  const forward = [Math.cos(rad), Math.sin(rad)] as const;
  const lateral = [-Math.sin(rad), Math.cos(rad)] as const;
  const at = (north: number, east: number): Coordinate =>
    metersOffset(coordinate, north, east);
  const tip = at(
    forward[1] * BEACON_TIP_METERS,
    forward[0] * BEACON_TIP_METERS,
  );
  const right = at(
    forward[1] * -BEACON_BASE_METERS + lateral[1] * BEACON_HALF_WIDTH_METERS,
    forward[0] * -BEACON_BASE_METERS + lateral[0] * BEACON_HALF_WIDTH_METERS,
  );
  const left = at(
    forward[1] * -BEACON_BASE_METERS - lateral[1] * BEACON_HALF_WIDTH_METERS,
    forward[0] * -BEACON_BASE_METERS - lateral[0] * BEACON_HALF_WIDTH_METERS,
  );
  return [tip, right, left];
}

const trailAccessorProps = {
  getPath: (segment: TrailSegment) => segment.path,
  getColor: (segment: TrailSegment) => segment.color,
  pickable: false,
  capRounded: true,
  jointRounded: true,
} as const;

/**
 * Owns the MapboxOverlay and the per-frame layer assembly. Trail data is
 * rebuilt only when the cut vertex or statuses change; the connector and
 * beacon are rebuilt every update (two points, one polygon — cheap).
 */
export interface ReplayOverlayController {
  readonly overlay: MapboxOverlay;
  update(state: ReplayVisualState): void;
}

export function createReplayOverlayController(): ReplayOverlayController {
  const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  let lastTrailKey = "";
  let lastTrailData: TrailSegment[] = [];

  function update(state: ReplayVisualState): void {
    const trailKey = `${state.cutIndex}:${state.vertexStatuses === null ? "n" : "s"}:${state.playbackKind}`;
    if (trailKey !== lastTrailKey) {
      lastTrailKey = trailKey;
      lastTrailData = travelledTrailData(state);
    }

    const connectorData = headConnectorData(state);
    const polygon = beaconPolygon(state.head);
    const layers: Layer[] = [
      new PathLayer({
        id: "recon-replay-trail-casing",
        data: lastTrailData,
        ...trailAccessorProps,
        getColor: () => PAPER,
        getWidth: () => TRAIL_CASING_WIDTH,
        opacity: 0.9,
      }),
      new PathLayer({
        id: "recon-replay-trail",
        data: lastTrailData,
        ...trailAccessorProps,
        getWidth: () => TRAIL_WIDTH,
      }),
      new PathLayer({
        id: "recon-replay-head-casing",
        data: connectorData,
        ...trailAccessorProps,
        getColor: () => PAPER,
        getWidth: () => TRAIL_CASING_WIDTH,
        opacity: 0.9,
      }),
      new PathLayer({
        id: "recon-replay-head",
        data: connectorData,
        ...trailAccessorProps,
        getWidth: () => TRAIL_WIDTH,
      }),
      new ScatterplotLayer({
        id: "recon-replay-beacon-halo",
        data: [{ position: state.head.coordinate }],
        getPosition: (d: { position: Coordinate }) => d.position,
        getRadius: () => 17,
        radiusUnits: "meters",
        radiusMinPixels: 9,
        radiusMaxPixels: 30,
        filled: true,
        stroked: false,
        getFillColor: () => PAPER,
        pickable: false,
      }),
      new SolidPolygonLayer({
        id: "recon-replay-beacon-wedge",
        data: [{ polygon }],
        getPolygon: (d: { polygon: Coordinate[] }) => d.polygon,
        filled: true,
        stroked: true,
        getFillColor: () => EMBER,
        getLineColor: () => rgba(RECON_COLORS.paper, 200),
        getLineWidth: () => 1.5,
        lineWidthUnits: "pixels",
        pickable: false,
      }),
      new ScatterplotLayer({
        id: "recon-replay-beacon-dot",
        data: [{ position: state.head.coordinate }],
        getPosition: (d: { position: Coordinate }) => d.position,
        getRadius: () => 4.5,
        radiusUnits: "meters",
        radiusMinPixels: 3,
        radiusMaxPixels: 9,
        filled: true,
        stroked: false,
        getFillColor: () => EMBER,
        pickable: false,
      }),
    ];
    overlay.setProps({ layers });
  }

  return { overlay, update };
}
