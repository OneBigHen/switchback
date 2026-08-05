import { describe, expect, it } from "vitest"
import { handleFreeRideSuggestions, type FreeRideCurvatureReader } from "@/app/api/free-ride/suggestions/handler"

const segment = {
  id: "ridge-1",
  name: "Ridge Road",
  score: 1_200,
  surface: "asphalt",
  geometry: [[-77.05, 40.12], [-77.02, 40.16]] as [number, number][]
}

const reader: FreeRideCurvatureReader = {
  queryBounds: () => [segment]
}

function request(body: unknown): Request {
  return new Request("http://switchback.test/api/free-ride/suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
}

describe("Free Ride suggestion API", () => {
  it("turns bounded curvature data into one ranked actionable suggestion", async () => {
    const response = await handleFreeRideSuggestions(request({
      position: [-77.1, 40.1],
      headingDegrees: 45,
      gpsConfidence: 0.95,
      workload: "low",
      profile: "neural"
    }), reader)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.source).toBe("curvature-database")
    expect(body.suggestion).toMatchObject({
      id: "ridge-1",
      kind: "fun-road",
      destination: [-77.02, 40.16]
    })
    expect(body.suggestion.title).toMatch(/Fun road ahead/i)
  })

  it("returns a safe suppressed response when GPS confidence is low", async () => {
    const response = await handleFreeRideSuggestions(request({
      position: [-77.1, 40.1],
      gpsConfidence: 0.2,
      workload: "low",
      profile: "neural"
    }), reader)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      suggestion: null,
      suppressed: true,
      suppressionReason: "gps-uncertain"
    })
  })

  it("does not hide missing curvature data behind a fake suggestion", async () => {
    const unavailable: FreeRideCurvatureReader = {
      queryBounds: () => { throw new Error("segments db missing") }
    }
    const response = await handleFreeRideSuggestions(request({
      position: [-77.1, 40.1],
      gpsConfidence: 0.95,
      workload: "low",
      profile: "neural"
    }), unavailable)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FREE_RIDE_DATA_UNAVAILABLE" }
    })
  })
})
