import { describe, expect, it } from "vitest";
import {
  ReconCameraDirector,
  defaultCameraMode,
  type ReconDirectorEnvironment,
  type ReconDirectorPath,
  type ReconDirectorPose,
  type ReconDirectorSample,
} from "@/features/recon/replay/camera-director";
import { turfDistance } from "@/lib/client/geo-math";

/**
 * RED tests for the deterministic replay camera director.
 *
 * The director owns high-frequency camera state OUTSIDE React: pure,
 * deterministic updates from (mode, sample, path, dt). These tests pin the
 * contract that matters to a rider: no 359°→0° bearing spin across north,
 * manual interaction wins over the director until Resume Follow, and
 * reduced motion picks conservative, static behaviour.
 */

const DESKTOP_ENV: ReconDirectorEnvironment = {
  viewport: { width: 1440, height: 900 },
  reducedMotion: false,
  compactViewport: false,
};

/**
 * A straight ~11 km northbound path for lookahead lookups. Latitude d maps
 * to playback position d / 0.1, so fixtures pair sample coordinates with
 * consistent path positions.
 */
const NORTH_PATH: ReconDirectorPath = {
  coordinates: [
    [0, 0],
    [0, 0.05],
    [0, 0.1],
  ],
  cumulativeDistancesMeters: [0, 5560, 11120],
  position: 0,
};

function pathAt(position: number): ReconDirectorPath {
  return { ...NORTH_PATH, position };
}

function sampleAt(
  latitude: number,
  bearingDegrees: number,
  paused = false,
): ReconDirectorSample {
  return { coordinate: [0, latitude], bearingDegrees, paused };
}

/** Shortest signed arc from a to b, in (-180, 180]. */
function angularDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

function normalized(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Runs the director to convergence on an unchanging sample. */
function settle(
  director: ReconCameraDirector,
  sample: ReconDirectorSample,
  path: ReconDirectorPath | null,
  steps = 300,
  dtMs = 100,
): ReconDirectorPose {
  let pose: ReconDirectorPose | null = null;
  for (let step = 0; step < steps; step += 1) {
    pose = director.update(sample, path, dtMs);
  }
  return pose!;
}

describe("defaultCameraMode", () => {
  it("picks Overview on compact (phone-class) viewports", () => {
    expect(
      defaultCameraMode({
        viewport: { width: 390, height: 720 },
        reducedMotion: false,
        compactViewport: true,
      }),
    ).toBe("overview");
  });

  it("picks Chase on desktop viewports", () => {
    expect(defaultCameraMode(DESKTOP_ENV)).toBe("chase");
  });
});

describe("ReconCameraDirector suspension", () => {
  it("starts following and reports the default mode", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    expect(director.mode).toBe("chase");
    expect(director.following).toBe(true);
  });

  it("manual override suspends the director: the pose freezes exactly", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const settled = settle(director, sampleAt(0.02, 30), NORTH_PATH);
    director.suspend();
    expect(director.following).toBe(false);

    // The rider pans and the replay moves on: the director must not fight.
    const frozen = director.update(sampleAt(0.08, 200), NORTH_PATH, 100);
    const again = director.update(sampleAt(0.09, 210), NORTH_PATH, 100);

    expect(frozen.center).toEqual(settled.center);
    expect(frozen.bearingDegrees).toBe(settled.bearingDegrees);
    expect(frozen.zoom).toBe(settled.zoom);
    expect(frozen.pitch).toBe(settled.pitch);
    expect(again).toEqual(frozen);
  });

  it("resume restores following: the pose converges back onto the ride", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.suspend();
    director.resume();
    expect(director.following).toBe(true);

    // Northbound ride: a following camera leads the rider again.
    const pose = settle(director, sampleAt(0.06, 0), pathAt(0.6));
    expect(pose.center[1]).toBeGreaterThan(0.06);
    expect(pose.center[1]).toBeLessThan(0.08);
  });

  it("free mode never moves the camera either", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.setMode("free");
    const pose = settle(director, sampleAt(0.03, 90), NORTH_PATH);
    const moved = director.update(sampleAt(0.07, 180), NORTH_PATH, 100);
    expect(moved).toEqual(pose);
  });
});

describe("ReconCameraDirector chase following", () => {
  it("converges onto the direction of travel without overshoot churn", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const pose = settle(director, sampleAt(0.02, 90), pathAt(0.2));

    expect(normalized(pose.bearingDegrees)).toBeCloseTo(90, 0);
    // Chase keeps the camera pitched and close: the cinematic band.
    expect(pose.pitch).toBeGreaterThanOrEqual(50);
    expect(pose.pitch).toBeLessThanOrEqual(70);
    expect(turfDistance(pose.center, [0, 0.02])).toBeLessThan(400);
  });

  it("carries the camera forward through a ride, following the sample", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const first = settle(director, sampleAt(0.01, 0), pathAt(0.1));
    const later = settle(director, sampleAt(0.05, 0), pathAt(0.5));

    expect(later.center[1]).toBeGreaterThan(first.center[1]);
  });
});

describe("ReconCameraDirector bearing across north", () => {
  it("crosses 355°→5° through north, never the long way around", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const settled = settle(director, sampleAt(0.02, 355), pathAt(0.2));
    let previous = normalized(settled.bearingDegrees);

    for (const target of [358, 0, 2, 5]) {
      const next = director.update(sampleAt(0.02, target), pathAt(0.2), 100);
      const current = normalized(next.bearingDegrees);
      // Each step takes the short arc: a 359°→0° spin artifact would show
      // up as a huge single-step swing (the long way through 180°).
      expect(Math.abs(angularDelta(previous, current))).toBeLessThan(30);
      // And it never drifts away from the target.
      expect(Math.abs(angularDelta(current, target))).toBeLessThanOrEqual(
        Math.abs(angularDelta(previous, target)),
      );
      previous = current;
    }

    const finalPose = settle(director, sampleAt(0.02, 5), pathAt(0.2), 200);
    expect(normalized(finalPose.bearingDegrees)).toBeCloseTo(5, 0);
  });

  it("does not spin 359°→0°: equal readings stay equal", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const settled = settle(director, sampleAt(0.02, 359.5), pathAt(0.2));
    const again = settle(director, sampleAt(0.02, 0.5), pathAt(0.2), 200);
    const delta = Math.abs(
      angularDelta(settled.bearingDegrees, again.bearingDegrees),
    );
    expect(delta).toBeLessThan(5);
  });
});

describe("ReconCameraDirector orbit", () => {
  it("rotates only while playback is paused", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.setMode("orbit");
    const start = settle(director, sampleAt(0.03, 30, true), pathAt(0.3), 60);

    // Paused: the orbit sweeps at a steady rate.
    const pausedA = director.update(sampleAt(0.03, 30, true), pathAt(0.3), 500);
    const pausedB = director.update(sampleAt(0.03, 30, true), pathAt(0.3), 500);
    const pausedSweep = Math.abs(
      angularDelta(pausedA.bearingDegrees, pausedB.bearingDegrees),
    );
    expect(pausedSweep).toBeGreaterThan(1);
    expect(Math.abs(angularDelta(start.bearingDegrees, pausedB.bearingDegrees))).toBeGreaterThan(1);

    // Playing: the spin stops — the pose converges onto a frozen target,
    // closing the easing lag instead of sweeping.
    const playingA = director.update(sampleAt(0.03, 30, false), pathAt(0.3), 500);
    const playingB = director.update(sampleAt(0.03, 30, false), pathAt(0.3), 500);
    const playingC = director.update(sampleAt(0.03, 30, false), pathAt(0.3), 500);
    const deltaAB = Math.abs(angularDelta(playingA.bearingDegrees, playingB.bearingDegrees));
    const deltaBC = Math.abs(angularDelta(playingB.bearingDegrees, playingC.bearingDegrees));
    expect(deltaBC).toBeLessThan(deltaAB);
    expect(deltaBC).toBeLessThan(pausedSweep);
  });
});

describe("ReconCameraDirector reduced motion", () => {
  it("snaps to the target on the first update instead of easing", () => {
    const director = new ReconCameraDirector({
      ...DESKTOP_ENV,
      reducedMotion: true,
    });
    const pose = director.update(sampleAt(0.04, 270), pathAt(0.4), 100);

    expect(normalized(pose.bearingDegrees)).toBeCloseTo(270, 3);
    // The snapped pose still frames the ride: the center leads the rider.
    expect(pose.center[1]).toBeGreaterThan(0.04);
    expect(pose.center[1]).toBeLessThan(0.05);
  });

  it("orbit stays static under reduced motion even while paused", () => {
    const director = new ReconCameraDirector({
      ...DESKTOP_ENV,
      reducedMotion: true,
    });
    director.setMode("orbit");
    const first = director.update(sampleAt(0.03, 30, true), pathAt(0.3), 1000);
    const second = director.update(sampleAt(0.03, 30, true), pathAt(0.3), 1000);
    expect(second.bearingDegrees).toBe(first.bearingDegrees);
  });
});

describe("ReconCameraDirector determinism", () => {
  it("identical input sequences produce identical poses", () => {
    function run(): ReconDirectorPose[] {
      const director = new ReconCameraDirector(DESKTOP_ENV);
      const poses: ReconDirectorPose[] = [];
      let latitude = 0;
      let bearing = 10;
      for (let step = 0; step < 60; step += 1) {
        latitude += 0.001;
        bearing = (bearing + 7) % 360;
        const paused = step > 40;
        poses.push(
          director.update(sampleAt(latitude, bearing, paused), pathAt(0.2), 50),
        );
      }
      return poses;
    }

    expect(run()).toEqual(run());
  });
});

describe("ReconCameraDirector path handling", () => {
  it("degrades gracefully without a path: the sample stays centered", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const pose = settle(director, sampleAt(0.05, 45), null);
    expect(turfDistance(pose.center, [0, 0.05])).toBeLessThan(120);
  });

  it("keeps the camera inside the map's usable pose space", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    const pose = settle(director, sampleAt(0.02, 90), pathAt(0.2));
    expect(pose.pitch).toBeGreaterThanOrEqual(0);
    expect(pose.pitch).toBeLessThanOrEqual(75);
    expect(pose.zoom).toBeGreaterThanOrEqual(3);
    expect(pose.zoom).toBeLessThanOrEqual(18);
    expect(Number.isFinite(pose.center[0])).toBe(true);
    expect(Number.isFinite(pose.center[1])).toBe(true);
  });
});

describe("ReconCameraDirector overview", () => {
  it("keeps meaningful upcoming geometry visible: the center leads the rider", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.setMode("overview");
    const position = 0.1;
    const pose = settle(
      director,
      { ...sampleAt(0.011, 0), paused: false },
      pathAt(position),
    );
    // Overview looks down the ride: the center sits ahead of the rider,
    // not on them.
    expect(pose.center[1]).toBeGreaterThan(0.011);
    expect(pose.center[1]).toBeLessThan(0.05);
    // Overview stays calmer than chase.
    expect(pose.zoom).toBeLessThan(14.5);
  });
});

describe("ReconCameraDirector lead", () => {
  it("positions ahead of the rider looking back along the ride", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.setMode("lead");
    const pose = settle(director, sampleAt(0.03, 0), pathAt(0.3));

    // Looking back at a northbound rider means facing south.
    expect(normalized(pose.bearingDegrees)).toBeCloseTo(180, 0);
    // The center sits near the rider so they stay framed.
    expect(turfDistance(pose.center, [0, 0.03])).toBeLessThan(400);
  });
});

describe("ReconCameraDirector environment", () => {
  it("accepts environment updates without breaking determinism", () => {
    const director = new ReconCameraDirector(DESKTOP_ENV);
    director.setEnvironment({
      viewport: { width: 390, height: 720 },
      reducedMotion: true,
      compactViewport: true,
    });
    const pose = director.update(sampleAt(0.02, 120), pathAt(0.2), 100);
    expect(normalized(pose.bearingDegrees)).toBeCloseTo(120, 3);
  });
});
