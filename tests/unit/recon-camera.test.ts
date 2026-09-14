import { describe, expect, it } from "vitest"
import type { Coordinate } from "@/lib/routing/types"
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter"
import { buildCinematicPlan } from "@/features/recon/cinematic/shot-plan"
import { ReconCameraDirector, blendPose, shortestArc } from "@/features/recon/replay/camera-director"
import { beaconWedge } from "@/features/recon/replay/replay-overlay"
import { displayPath, pointAtFraction, progressAtDistance, sampleReplay } from "@/features/recon/replay/replay-timeline"
import { iso, makeRecordedRide, makeRidePoint, TEST_RIDE_START_MS } from "./fixtures/recon-fixtures"

function northboundRide() {
  const moving = Array.from({ length: 200 }, (_, index) => [-77.5, 40.8 + index * 0.0005] as Coordinate)
  // A five-minute stop halfway: sixty fixes at the same place, time running on.
  const coordinates = [...moving.slice(0, 100), ...Array.from({ length: 60 }, () => moving[99]!), ...moving.slice(100)]
  const points = coordinates.map((coordinate, index) => makeRidePoint(coordinate, iso(TEST_RIDE_START_MS + index * 5_000), { speedMph: 30 }))
  return adaptRecordedRide(makeRecordedRide({ points, startedAt: points[0]!.recordedAt, endedAt: points[points.length - 1]!.recordedAt }))!
}

describe("camera director", () => {
  it("crosses north along the shortest arc", () => {
    expect(shortestArc(355, 5)).toBe(10)
    expect(shortestArc(5, 355)).toBe(-10)
    expect(blendPose({ center: [0, 0], bearing: 350, pitch: 0, zoom: 1 }, { center: [0, 0], bearing: 10, pitch: 0, zoom: 1 }, 0.5).bearing).toBeCloseTo(0, 6)
  })

  it("keeps the rider inside the chase frame at fast playback", () => {
    const track = northboundRide()
    const path = displayPath(track)!
    const director = new ReconCameraDirector("chase", false, 800)
    let pose = null
    for (let frame = 0; frame < 120; frame += 1) {
      pose = director.update({ path, fraction: frame / 400, groundSpeedMps: 900, playing: true, dtMs: 16 })
    }
    const rider = pointAtFraction(path, 119 / 400).coordinate
    // Within ~2 km of the camera center even at 900 m of ground per second.
    expect(Math.abs(pose!.center[1] - rider[1]) * 111_320).toBeLessThan(2_000)
    expect(pose!.bearing < 5 || pose!.bearing > 355).toBe(true)
  })

  it("hands the camera to the rider after manual interaction until resumed", () => {
    const path = displayPath(northboundRide())!
    const director = new ReconCameraDirector("chase", false)
    director.suspend()
    expect(director.update({ path, fraction: 0.5, groundSpeedMps: 20, playing: true, dtMs: 16 })).toBeNull()
    director.resume()
    expect(director.update({ path, fraction: 0.5, groundSpeedMps: 20, playing: true, dtMs: 16 })).not.toBeNull()
  })
})

describe("replay mapping", () => {
  it("maps distance back to the time the ride first reached it, across a stop", () => {
    const track = northboundRide()
    // The stop sits 99 of 199 equal moving segments along the ride.
    const stopMeters = (track.distanceMeters * 99) / 199 - 0.01
    const atStop = sampleReplay(track, progressAtDistance(track, stopMeters))!
    expect(atStop.distanceMeters).toBeCloseTo(stopMeters, 0)
    // Arrival at the stop (~495 s), not the moment the rider left it (~795 s).
    expect(atStop.elapsedMs! / 1000).toBeLessThan(520)
  })

  it("points the rider beacon along the direction of travel", () => {
    const head: Coordinate = [-77.5, 40.8]
    const [tip] = beaconWedge(head, 0, 20)
    expect(tip![1]).toBeGreaterThan(head[1])
    expect(Math.abs(tip![0] - head[0])).toBeLessThan(1e-9)
    const [east] = beaconWedge(head, 90, 20)
    expect(east![0]).toBeGreaterThan(head[0])
  })
})

describe("cinematic plan", () => {
  it("is deterministic per ride and covers the whole ride in order", () => {
    const track = northboundRide()
    const path = displayPath(track)!
    const twistiness = Array.from({ length: 180 }, (_, index) => (index > 120 && index < 140 ? 70 : 5))
    const a = buildCinematicPlan({ id: track.id, path, twistiness })
    const b = buildCinematicPlan({ id: track.id, path, twistiness })
    expect(a.shots).toEqual(b.shots)
    expect(a.shots[0]!.kind).toBe("establish")
    expect(a.shots[a.shots.length - 1]!.kind).toBe("pullaway")
    expect(a.shots.some((shot) => shot.kind === "reveal")).toBe(true)
    expect(a.fractionAt(0)).toBe(0)
    expect(a.fractionAt(a.totalSeconds)).toBe(1)
    let previous = 0
    for (let seconds = 0; seconds <= a.totalSeconds; seconds += 0.5) {
      const fraction = a.fractionAt(seconds)
      expect(fraction).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = fraction
    }
  })

  it("lingers on twisty road", () => {
    const track = northboundRide()
    const path = displayPath(track)!
    const twistiness = Array.from({ length: 100 }, (_, index) => (index >= 50 ? 90 : 0))
    const plan = buildCinematicPlan({ id: track.id, path, twistiness })
    const mid = plan.rideStartSeconds + (plan.rideEndSeconds - plan.rideStartSeconds) / 2
    // Calm first half of the road is covered in well under half the ride time.
    expect(plan.fractionAt(mid)).toBeGreaterThan(0.6)
  })
})
