import { describe, expect, it } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { RouteRequest } from "@/lib/routing/types"

function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    profile: "gravel",
    points: [
      { lat: 40.2, lon: -75.2 },
      { lat: 40.3, lon: -75.1 }
    ],
    ...overrides
  }
}

describe("gravel atlas request normalization", () => {
  it("keeps atlas routing disabled by default so existing plans are unchanged", () => {
    expect(normalizeRouteRequest(request()).gravelAtlas).toEqual({
      enabled: false,
      intensity: "balanced"
    })
  })

  it.each(["balanced", "more", "maximum"] as const)(
    "preserves an explicit gravel-atlas %s intensity for an eligible profile",
    (intensity) => {
      expect(normalizeRouteRequest(request({
        gravelAtlas: { enabled: true, intensity }
      })).gravelAtlas).toEqual({ enabled: true, intensity })
    }
  )

  it("fails closed when untrusted request JSON contains an unknown intensity", () => {
    const unsafe = request() as RouteRequest & { gravelAtlas: unknown }
    unsafe.gravelAtlas = { enabled: true, intensity: "send-it" }

    expect(normalizeRouteRequest(unsafe as RouteRequest).gravelAtlas).toEqual({
      enabled: false,
      intensity: "balanced"
    })
  })

  it("fails closed when enabled is not a literal boolean true", () => {
    const unsafe = request() as RouteRequest & { gravelAtlas: unknown }
    unsafe.gravelAtlas = { enabled: "yes", intensity: "maximum" }

    expect(normalizeRouteRequest(unsafe as RouteRequest).gravelAtlas).toEqual({
      enabled: false,
      intensity: "balanced"
    })
  })

  it("does not silently activate gravel-atlas attraction for a non-adventure road profile", () => {
    expect(normalizeRouteRequest(request({
      profile: "quick",
      gravelAtlas: { enabled: true, intensity: "maximum" }
    })).gravelAtlas).toEqual({
      enabled: false,
      intensity: "balanced"
    })
  })
})
