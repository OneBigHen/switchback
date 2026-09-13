import { EventEmitter } from "node:events"
import { describe, expect, it } from "vitest"
import {
  childProcessCompletion,
  graphFingerprintFromParts,
  motorcycleWayDirections,
  createNodeFirstOplGuard,
  motorcycleWayIsRoutable,
  parseCanonicalGraphExport
} from "@/lib/roads/gravel-atlas/graph-build"

describe("canonical graph export guards", () => {
  it("requires the object export with its embedded graph fingerprint", () => {
    const segments = [{ segmentUid: "s" }]
    expect(() => parseCanonicalGraphExport(segments)).toThrow(/graphFingerprint/)
    expect(() => parseCanonicalGraphExport({ segments })).toThrow(/graphFingerprint/)
    expect(() => parseCanonicalGraphExport({ graphFingerprint: "a".repeat(64), segments }, "b".repeat(64))).toThrow(/does not match/)
    expect(parseCanonicalGraphExport({ graphFingerprint: "a".repeat(64), segments }, "a".repeat(64))).toMatchObject({ graphFingerprint: "a".repeat(64) })
  })

  it("refuses OPL input whose nodes are not all before its ways", () => {
    const guard = createNodeFirstOplGuard()
    expect(() => { guard.observe("n1 x1 y1"); guard.observe("n2 x1 y1"); guard.observe("w1 Nn1,n2") }).not.toThrow()
    expect(() => guard.observe("n3 x1 y1")).toThrow(/sorted/)
  })
})

describe("Gravel Atlas graph build semantics", () => {
  it("fingerprints the exact routing inputs deterministically", () => {
    const first = graphFingerprintFromParts({
      osmSha256: "a".repeat(64),
      graphHopperSha256: "b".repeat(64),
      configSha256: "c".repeat(64),
      customModelSha256s: {
        "motorcycle-adventure.json": "d".repeat(64),
        "motorcycle-base.json": "e".repeat(64)
      }
    })
    const reordered = graphFingerprintFromParts({
      osmSha256: "a".repeat(64),
      graphHopperSha256: "b".repeat(64),
      configSha256: "c".repeat(64),
      customModelSha256s: {
        "motorcycle-base.json": "e".repeat(64),
        "motorcycle-adventure.json": "d".repeat(64)
      }
    })

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(reordered).toBe(first)
    expect(graphFingerprintFromParts({
      osmSha256: "f".repeat(64),
      graphHopperSha256: "b".repeat(64),
      configSha256: "c".repeat(64),
      customModelSha256s: {}
    })).not.toBe(first)
  })

  it("mirrors the adventure profile's hard access exclusions", () => {
    expect(motorcycleWayIsRoutable({ highway: "track", surface: "gravel" })).toBe(true)
    expect(motorcycleWayIsRoutable({ highway: "residential", access: "private" })).toBe(false)
    // The most specific access tag wins, as in GraphHopper's access parsing of
    // the prepared motorcycle PBF (motorcycle is projected onto motorcar).
    expect(motorcycleWayIsRoutable({ highway: "track", motorcar: "no", motorcycle: "yes" })).toBe(true)
    expect(motorcycleWayIsRoutable({ highway: "track", motor_vehicle: "no", motorcycle: "yes" })).toBe(true)
    expect(motorcycleWayIsRoutable({ highway: "residential", access: "private", motorcycle: "yes" })).toBe(true)
    expect(motorcycleWayIsRoutable({ highway: "track", motorcycle: "no" })).toBe(false)
    expect(motorcycleWayIsRoutable({ highway: "track", motor_vehicle: "no" })).toBe(false)
    expect(motorcycleWayIsRoutable({ highway: "path" })).toBe(false)
    expect(motorcycleWayIsRoutable({ highway: "construction" })).toBe(false)
  })

  it("uses normalized motorcycle one-way state when emitting canonical directions", () => {
    expect(motorcycleWayDirections({ highway: "track" })).toEqual(["forward", "reverse"])
    expect(motorcycleWayDirections({ highway: "track", oneway: "yes" })).toEqual(["forward"])
    expect(motorcycleWayDirections({ highway: "track", oneway: "-1" })).toEqual(["reverse"])
    expect(motorcycleWayDirections({ highway: "residential", junction: "roundabout" })).toEqual(["forward"])
  })

  it("captures a child close event even when the caller awaits completion later", async () => {
    const child = new EventEmitter()
    const completion = childProcessCompletion(child)

    child.emit("close", 0)
    await Promise.resolve()

    await expect(completion).resolves.toBe(0)
  })
})
