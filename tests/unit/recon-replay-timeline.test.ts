import { describe, expect, it } from "vitest";
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter";
import { adaptCatalogRoute } from "@/features/recon/data/catalog-route-adapter";
import {
  RECON_MAX_RENDER_VERTICES,
  decimateTrackForDisplay,
  displayCutIndex,
  sampleReplay,
} from "@/features/recon/replay/replay-timeline";
import { classifyExploration } from "@/features/recon/replay/exploration";
import { polylineDistanceMeters } from "@/lib/client/geo-math";
import type { ReconTrack, ReconTrackPoint } from "@/features/recon/types";
import {
  makePlannedRoute,
  makeRecordedRide,
  TEST_RIDE_START_MS,
} from "./fixtures/recon-fixtures";

describe("sampleReplay on recorded tracks", () => {
  const track = adaptRecordedRide(makeRecordedRide())!;

  it("returns the exact first point at position 0", () => {
    const frame = sampleReplay(track, 0)!;

    expect(frame).toEqual({
      progress: 0,
      elapsedMs: 0,
      coordinate: [0, 0],
      bearingDegrees: 0,
      speedMph: 10,
      altitudeMeters: 100,
    });
  });

  it("returns the exact last point at position 1 with the full duration", () => {
    const frame = sampleReplay(track, 1)!;

    expect(frame).toEqual({
      progress: 1,
      elapsedMs: 120_000,
      coordinate: [0, 0.002],
      bearingDegrees: 0,
      speedMph: 30,
      altitudeMeters: 120,
    });
  });

  it("lands exactly on a recorded point when the position matches its timestamp", () => {
    const frame = sampleReplay(track, 0.5)!;

    expect(frame.elapsedMs).toBe(60_000);
    expect(frame.coordinate).toEqual([0, 0.001]);
    expect(frame.speedMph).toBe(20);
    expect(frame.altitudeMeters).toBe(140);
  });

  it("interpolates between adjacent points, bounded by them", () => {
    const frame = sampleReplay(track, 0.25)!;

    expect(frame.elapsedMs).toBe(30_000);
    expect(frame.coordinate[1]).toBeCloseTo(0.0005, 12);
    expect(frame.coordinate[0]).toBe(0);
    expect(frame.speedMph).toBe(15);
    expect(frame.altitudeMeters).toBe(120);
  });

  it("normalizes elapsed time to start at zero and never emits absolute epochs", () => {
    for (const position of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const frame = sampleReplay(track, position)!;
      expect(frame.elapsedMs).not.toBeNull();
      expect(frame.elapsedMs!).toBeGreaterThanOrEqual(0);
      expect(frame.elapsedMs!).toBeLessThanOrEqual(120_000);
      // An absolute epoch value would be astronomically larger than the ride.
      expect(frame.elapsedMs!).toBeLessThan(TEST_RIDE_START_MS);
    }
  });

  it("clamps out-of-range positions to the ride bounds", () => {
    const early = sampleReplay(track, -0.5)!;
    expect(early.progress).toBe(0);
    expect(early.coordinate).toEqual([0, 0]);

    const late = sampleReplay(track, 1.5)!;
    expect(late.progress).toBe(1);
    expect(late.coordinate).toEqual([0, 0.002]);
  });

  it("fails safely on non-finite positions", () => {
    expect(sampleReplay(track, Number.NaN)).toBeNull();
    expect(sampleReplay(track, Number.POSITIVE_INFINITY)).toBeNull();
    expect(sampleReplay(track, Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("keeps unknown speed and altitude unknown during interpolation", () => {
    const partial = adaptRecordedRide(
      makeRecordedRide({
        points: [
          {
            coordinate: [0, 0],
            recordedAt: isoAt(0),
            speedMph: null,
            altitudeMeters: 100,
          },
          {
            coordinate: [0, 0.001],
            recordedAt: isoAt(60_000),
            speedMph: 20,
            altitudeMeters: null,
          },
        ],
      }),
    )!;

    expect(sampleReplay(partial, 0)!.speedMph).toBeNull();
    expect(sampleReplay(partial, 0.5)!.speedMph).toBeNull();
    expect(sampleReplay(partial, 0.5)!.altitudeMeters).toBeNull();
    expect(sampleReplay(partial, 1)!.speedMph).toBe(20);
  });

  it("follows the direction of travel with geometric bearing, normalized to [0, 360)", () => {
    const westbound = adaptCatalogRoute(
      makePlannedRoute({
        geometry: [
          [0.002, 0],
          [0, 0],
        ],
      }),
    )!;

    // Turf reports west as -90; the frame normalizes it to 270.
    expect(sampleReplay(westbound, 0)!.bearingDegrees).toBe(270);
    expect(sampleReplay(westbound, 1)!.bearingDegrees).toBe(270);
    expect(sampleReplay(track, 0.5)!.bearingDegrees).toBe(0);
  });

  it("never mutates the track", () => {
    const before = structuredClone(track);
    for (let position = 0; position <= 1; position += 0.05)
      sampleReplay(track, position);
    expect(track).toEqual(before);
  });
});

describe("sampleReplay on preview tracks", () => {
  const track = adaptCatalogRoute(
    makePlannedRoute({
      geometry: [
        [0, 0],
        [0, 0.002],
      ],
      ascentMeters: null,
      descentMeters: null,
    }),
  )!;

  it("interpolates on distance-normalized progress with exact endpoints", () => {
    const start = sampleReplay(track, 0)!;
    expect(start.coordinate).toEqual([0, 0]);

    const middle = sampleReplay(track, 0.5)!;
    expect(middle.coordinate[1]).toBeCloseTo(0.001, 12);

    const end = sampleReplay(track, 1)!;
    expect(end.coordinate).toEqual([0, 0.002]);
  });

  it("never emits synthetic observed speed or elapsed time", () => {
    for (let position = 0; position <= 1.0001; position += 0.1) {
      const frame = sampleReplay(track, position)!;
      expect(frame.elapsedMs).toBeNull();
      expect(frame.speedMph).toBeNull();
    }
  });
});

describe("sampleReplay fails safely on impossible tracks", () => {
  function literalTrack(
    points: ReconTrackPoint[],
    playbackKind: "recorded" | "preview",
  ): ReconTrack {
    return {
      id: "literal",
      name: "Literal",
      sourceKind:
        playbackKind === "recorded" ? "recorded-ride" : "catalog-route",
      playbackKind,
      geometry: {
        type: "LineString",
        coordinates: points.map((point) => point.coordinate),
      },
      points,
      distanceMeters: 100,
      startedAt: null,
      endedAt: null,
      routeId: null,
      facts: {
        durationMinutes: null,
        ascentMeters: null,
        descentMeters: null,
        surfaceKnown: false,
        matchPercent: null,
        confidence: null,
      },
    };
  }

  function pointAt(
    coordinate: [number, number],
    recordedAt: number | null,
  ): ReconTrackPoint {
    return {
      coordinate,
      recordedAt,
      speedMph: null,
      altitudeMeters: null,
      headingDegrees: null,
      accuracyMeters: null,
    };
  }

  it("rejects decreasing recorded timestamps instead of inventing order", () => {
    const backwards = literalTrack(
      [
        pointAt([0, 0], 120_000),
        pointAt([0, 0.001], 60_000),
        pointAt([0, 0.002], 0),
      ],
      "recorded",
    );

    expect(sampleReplay(backwards, 0)).toBeNull();
    expect(sampleReplay(backwards, 0.5)).toBeNull();
    expect(sampleReplay(backwards, 1)).toBeNull();
  });

  it("cannot sample a zero-duration recorded timeline", () => {
    const frozen = literalTrack(
      [pointAt([0, 0], 0), pointAt([0, 0.001], 0), pointAt([0, 0.002], 0)],
      "recorded",
    );

    expect(sampleReplay(frozen, 0.5)).toBeNull();
  });

  it("cannot sample tracks with fewer than two points", () => {
    const single = literalTrack([pointAt([0, 0], 0)], "recorded");
    const previewSingle = literalTrack([pointAt([0, 0], null)], "preview");

    expect(sampleReplay(single, 0.5)).toBeNull();
    expect(sampleReplay(previewSingle, 0.5)).toBeNull();
  });

  it("cannot sample tracks carrying invalid coordinates", () => {
    const nanTrack = literalTrack(
      [pointAt([Number.NaN, 0], null), pointAt([0, 0.001], null)],
      "preview",
    );

    expect(sampleReplay(nanTrack, 0.5)).toBeNull();
  });

  it("tolerates recorded stops with equal adjacent timestamps", () => {
    const withStop = adaptRecordedRide(
      makeRecordedRide({
        points: [
          {
            coordinate: [0, 0],
            recordedAt: isoAt(0),
            speedMph: 10,
            altitudeMeters: 100,
          },
          {
            coordinate: [0, 0],
            recordedAt: isoAt(30_000),
            speedMph: 0,
            altitudeMeters: 100,
          },
          {
            coordinate: [0, 0.002],
            recordedAt: isoAt(120_000),
            speedMph: 30,
            altitudeMeters: 120,
          },
        ],
      }),
    )!;

    const midStop = sampleReplay(withStop, 0.25)!;
    expect(midStop.elapsedMs).toBe(30_000);
    expect(midStop.coordinate).toEqual([0, 0]);

    const resumed = sampleReplay(withStop, 0.5)!;
    expect(resumed.elapsedMs).toBe(60_000);
    // 30 s of the 90 s leg from the stop to the finish: one third north.
    expect(resumed.coordinate[1]).toBeCloseTo(0.002 / 3, 12);
  });

  it("carries the last valid heading through a recorded stop instead of inventing north", () => {
    // Eastbound ride (bearing 90°) with a stop in the middle: the two points
    // at [0.001, 0] repeat, and the frame at the stop must read east — the
    // last real direction of travel — never the north that an identical-point
    // bearing would invent at every red light.
    const eastboundWithStop = adaptRecordedRide(
      makeRecordedRide({
        points: [
          {
            coordinate: [0, 0],
            recordedAt: isoAt(0),
            speedMph: 10,
            altitudeMeters: 100,
          },
          {
            coordinate: [0.001, 0],
            recordedAt: isoAt(30_000),
            speedMph: 10,
            altitudeMeters: 100,
          },
          {
            coordinate: [0.001, 0],
            recordedAt: isoAt(60_000),
            speedMph: 0,
            altitudeMeters: 100,
          },
          {
            coordinate: [0.002, 0],
            recordedAt: isoAt(120_000),
            speedMph: 10,
            altitudeMeters: 100,
          },
        ],
      }),
    )!;

    expect(sampleReplay(eastboundWithStop, 0)!.bearingDegrees).toBe(90);
    const atStop = sampleReplay(eastboundWithStop, 45_000 / 120_000)!;
    expect(atStop.coordinate).toEqual([0.001, 0]);
    expect(atStop.bearingDegrees).toBe(90);
    expect(sampleReplay(eastboundWithStop, 1)!.bearingDegrees).toBe(90);
  });
});

function isoAt(offsetMs: number): string {
  return new Date(TEST_RIDE_START_MS + offsetMs).toISOString();
}

/** File-level literal track factory for decimation/exploration cases. */
function literalTrackFrom(
  points: ReconTrackPoint[],
  playbackKind: "recorded" | "preview",
): ReconTrack {
  return {
    id: "literal-decimation",
    name: "Literal Decimation",
    sourceKind:
      playbackKind === "recorded" ? "recorded-ride" : "catalog-route",
    playbackKind,
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => point.coordinate),
    },
    points,
    distanceMeters: polylineDistanceMeters(
      points.map((point) => point.coordinate),
    ),
    startedAt: null,
    endedAt: null,
    routeId: null,
    facts: {
      durationMinutes: null,
      ascentMeters: null,
      descentMeters: null,
      surfaceKnown: false,
      matchPercent: null,
      confidence: null,
    },
  };
}

function trackPointAt(
  coordinate: [number, number],
  recordedAt: number | null,
): ReconTrackPoint {
  return {
    coordinate,
    recordedAt,
    speedMph: null,
    altitudeMeters: null,
    headingDegrees: null,
    accuracyMeters: null,
  };
}

/** A long zigzagging northbound ride, one recorded timestamp per point. */
function longZigzagTrack(pointCount: number): ReconTrack {
  const points: ReconTrackPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    points.push(
      trackPointAt(
        [index % 2 === 0 ? 0 : 0.0001, index * 0.0001],
        index * 1000,
      ),
    );
  }
  return literalTrackFrom(points, "recorded");
}

/**
 * A mostly-straight northbound ride with one pronounced lateral spike at
 * index 1000 — the kind of shape change decimation must never lose.
 */
function spikeTrack(): ReconTrack {
  const points: ReconTrackPoint[] = [];
  for (let index = 0; index < 2000; index += 1) {
    const lng = index === 1000 ? 0.002 : 0;
    points.push(trackPointAt([lng, index * 0.0002], index * 1000));
  }
  return literalTrackFrom(points, "recorded");
}

/** A straight northbound preview, one point per ~111 m step. */
function straightNorthPreview(pointCount: number): ReconTrack {
  const points: ReconTrackPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    points.push(trackPointAt([0, index * 0.001], null));
  }
  return literalTrackFrom(points, "preview");
}

describe("display decimation", () => {
  it("keeps every point when the track is already under the cap", () => {
    const track = straightNorthPreview(4);
    const geometry = decimateTrackForDisplay(track)!;

    expect(geometry.coordinates).toEqual(track.geometry.coordinates);
    expect(geometry.originalIndices).toEqual([0, 1, 2, 3]);
  });

  it("preserves endpoints exactly when decimating", () => {
    const track = longZigzagTrack(6000);
    const geometry = decimateTrackForDisplay(track, 24)!;

    expect(geometry.originalIndices[0]).toBe(0);
    expect(
      geometry.originalIndices[geometry.originalIndices.length - 1],
    ).toBe(5999);
    expect(geometry.coordinates[0]).toEqual(track.geometry.coordinates[0]);
    expect(
      geometry.coordinates[geometry.coordinates.length - 1],
    ).toEqual(track.geometry.coordinates[5999]);
  });

  it("respects the vertex cap, with the default around 2000–4000", () => {
    const track = longZigzagTrack(6000);
    const capped = decimateTrackForDisplay(track, 24)!;
    const defaulted = decimateTrackForDisplay(track)!;

    expect(capped.coordinates.length).toBeLessThanOrEqual(24);
    expect(defaulted.coordinates.length).toBeLessThanOrEqual(
      RECON_MAX_RENDER_VERTICES,
    );
    expect(RECON_MAX_RENDER_VERTICES).toBeGreaterThanOrEqual(2000);
    expect(RECON_MAX_RENDER_VERTICES).toBeLessThanOrEqual(4000);
  });

  it("preserves point order through decimation", () => {
    const track = longZigzagTrack(6000);
    const geometry = decimateTrackForDisplay(track, 50)!;

    for (let index = 1; index < geometry.originalIndices.length; index += 1) {
      expect(geometry.originalIndices[index]).toBeGreaterThan(
        geometry.originalIndices[index - 1]!,
      );
    }
  });

  it("keeps major shape changes: a pronounced spike survives", () => {
    const track = spikeTrack();
    const geometry = decimateTrackForDisplay(track, 20)!;

    expect(geometry.originalIndices).toContain(1000);
  });

  it("is deterministic", () => {
    const track = spikeTrack();
    expect(decimateTrackForDisplay(track, 20)).toEqual(
      decimateTrackForDisplay(track, 20),
    );
  });

  it("fails closed on unsampleable tracks", () => {
    expect(decimateTrackForDisplay(straightNorthPreview(1))).toBeNull();
    const nanTrack = literalTrackFrom(
      [trackPointAt([Number.NaN, 0], null), trackPointAt([0, 0.001], null)],
      "preview",
    );
    expect(decimateTrackForDisplay(nanTrack)).toBeNull();
  });

  it("carries cumulative time for recorded tracks and none for previews", () => {
    const recorded = longZigzagTrack(100);
    const recordedGeometry = decimateTrackForDisplay(recorded)!;
    expect(recordedGeometry.cumulativeTimesMs).not.toBeNull();
    expect(recordedGeometry.cumulativeTimesMs![0]).toBe(0);
    expect(recordedGeometry.cumulativeTimesMs!.at(-1)).toBe(99_000);
    for (
      let index = 1;
      index < recordedGeometry.cumulativeTimesMs!.length;
      index += 1
    ) {
      expect(recordedGeometry.cumulativeTimesMs![index]).toBeGreaterThan(
        recordedGeometry.cumulativeTimesMs![index - 1]!,
      );
    }

    const preview = straightNorthPreview(100);
    expect(decimateTrackForDisplay(preview)!.cumulativeTimesMs).toBeNull();
  });
});

describe("displayCutIndex", () => {
  it("brackets the head between decimated vertices", () => {
    const track = straightNorthPreview(100);
    const geometry = decimateTrackForDisplay(track)!;

    expect(displayCutIndex(geometry, 0)).toBe(0);
    expect(displayCutIndex(geometry, 1)).toBe(
      geometry.coordinates.length - 1,
    );

    const position = 0.5;
    const cut = displayCutIndex(geometry, position);
    const headMeters = position * geometry.totalDistanceMeters;
    expect(geometry.cumulativeDistancesMeters[cut]).toBeLessThanOrEqual(
      headMeters + 1e-6,
    );
    expect(
      geometry.cumulativeDistancesMeters[cut + 1] ?? Number.POSITIVE_INFINITY,
    ).toBeGreaterThanOrEqual(headMeters - 1e-6);
  });

  it("is monotone in position", () => {
    const track = longZigzagTrack(500);
    const geometry = decimateTrackForDisplay(track, 30)!;

    let previous = 0;
    for (let step = 0; step <= 20; step += 1) {
      const cut = displayCutIndex(geometry, step / 20);
      expect(cut).toBeGreaterThanOrEqual(previous);
      previous = cut;
    }
  });

  it("fails closed on out-of-domain input", () => {
    const track = straightNorthPreview(10);
    const geometry = decimateTrackForDisplay(track)!;
    expect(displayCutIndex(geometry, Number.NaN)).toBe(0);
    expect(displayCutIndex(geometry, -3)).toBe(0);
    expect(displayCutIndex(geometry, 7)).toBe(geometry.coordinates.length - 1);
  });
});

describe("exploration status classification", () => {
  /** 12 points marching north at ~55.6 m steps (~611 m total). */
  function northRide(): ReconTrack {
    const points: ReconTrackPoint[] = [];
    for (let index = 0; index < 12; index += 1) {
      points.push(trackPointAt([0, index * 0.0005], index * 10_000));
    }
    return literalTrackFrom(points, "recorded");
  }

  function recordedCopy(
    track: ReconTrack,
    mapCoordinate: (coordinate: [number, number]) => [number, number],
    pointCount = track.points.length,
  ): ReconTrack {
    const points = track.points
      .slice(0, pointCount)
      .map((point, index) =>
        trackPointAt(mapCoordinate(point.coordinate as [number, number]), index * 10_000),
      );
    return literalTrackFrom(points, "recorded");
  }

  it("returns null with no history: no claim is made", () => {
    expect(classifyExploration(northRide(), [])).toBeNull();
  });

  it("claims nothing from history that was never ridden", () => {
    // Same shape, but a preview has no observed ride behind it.
    const previewHistory = literalTrackFrom(
      northRide().points.map((point) => trackPointAt(point.coordinate as [number, number], null)),
      "preview",
    );
    expect(classifyExploration(northRide(), [previewHistory])).toBeNull();
  });

  it("marks an identical recorded ride previously ridden end to end", () => {
    const track = northRide();
    const history = recordedCopy(track, (c) => c);
    const segments = classifyExploration(track, [history])!;

    expect(segments).toHaveLength(1);
    expect(segments[0]!.status).toBe("previously-ridden");
    expect(segments[0]!.fromIndex).toBe(0);
    expect(segments[0]!.toIndex).toBe(track.points.length - 1);
    expect(segments[0]!.distanceMeters).toBeCloseTo(track.distanceMeters, 3);
  });

  it("splits a partially-overlapping ride into contiguous segments", () => {
    const track = northRide();
    const history = recordedCopy(track, (c) => c, 6);
    const segments = classifyExploration(track, [history])!;

    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0]!.status).toBe("previously-ridden");
    expect(segments[segments.length - 1]!.status).toBe("new-to-you");

    // Contiguous tiling of the whole point range, in order.
    expect(segments[0]!.fromIndex).toBe(0);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]!.fromIndex).toBe(
        segments[index - 1]!.toIndex + 1,
      );
    }
    expect(segments[segments.length - 1]!.toIndex).toBe(
      track.points.length - 1,
    );
    for (const segment of segments) {
      expect(segment.distanceMeters).toBeGreaterThan(0);
    }
  });

  it("respects the tolerance band: nearby-but-off history does not match", () => {
    const track = northRide();
    // ~1.1 km east of the ride: well outside the 50 m tolerance.
    const offset = recordedCopy(track, ([lng, lat]) => [lng + 0.01, lat]);
    const segments = classifyExploration(track, [offset])!;

    expect(segments.length).toBeGreaterThanOrEqual(1);
    for (const segment of segments) {
      expect(segment.status).toBe("new-to-you");
    }
  });

  it("is direction-independent: a reversed prior ride still matches", () => {
    const track = northRide();
    const reversed = literalTrackFrom(
      [...track.points]
        .reverse()
        .map((point, index) =>
          trackPointAt(point.coordinate as [number, number], index * 10_000),
        ),
      "recorded",
    );
    const segments = classifyExploration(track, [reversed])!;

    expect(segments).toHaveLength(1);
    expect(segments[0]!.status).toBe("previously-ridden");
  });

  it("never mutates its inputs and is deterministic", () => {
    const track = northRide();
    const history = recordedCopy(track, (c) => c, 6);
    const trackBefore = structuredClone(track);
    const historyBefore = structuredClone(history);

    const first = classifyExploration(track, [history]);
    const second = classifyExploration(track, [history]);
    expect(first).toEqual(second);
    expect(track).toEqual(trackBefore);
    expect(history).toEqual(historyBefore);
  });

  it("ignores history tracks shorter than two points", () => {
    const track = northRide();
    const single = literalTrackFrom([trackPointAt([0, 0], 0)], "recorded");
    expect(classifyExploration(track, [single])).toBeNull();
  });
});
