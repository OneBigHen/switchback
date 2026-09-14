import { describe, expect, it } from "vitest";
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter";
import { adaptCatalogRoute } from "@/features/recon/data/catalog-route-adapter";
import { sampleReplay } from "@/features/recon/replay/replay-timeline";
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

    expect(frame.distanceMeters).toBe(0);
    expect(frame).toMatchObject({
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

    expect(frame.distanceMeters).toBeCloseTo(track.distanceMeters, 6);
    expect(frame).toMatchObject({
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
      plannedGeometry: null,
      note: null,
      moments: [],
      facts: {
        durationMinutes: null,
        ascentMeters: null,
        descentMeters: null,
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
