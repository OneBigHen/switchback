import { describe, expect, it, vi } from "vitest"
import { handleRideIntentRequest } from "@/app/api/ride-intent/handler"
import type { RideIntent } from "@/lib/ai/ride-intent"

const interpreted: RideIntent = {
  mode: "loop",
  profile: "adventure",
  rideCharacter: "adventure",
  targetMinutes: 120,
  tollPolicy: "allow-with-warning",
  ambiguous: false,
  startQuery: null,
  destinationQuery: null,
  stopQuery: "brewery",
  preferGravel: true,
  avoidHighways: false,
  summary: "120-minute adventure loop",
  source: "local"
}

describe("ride intent API", () => {
  it("returns validated conversational planning intent", async () => {
    const interpreter = vi.fn(async () => interpreted)
    const response = await handleRideIntentRequest(new Request("http://test/api/ride-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Two hours of gravel with a brewery" })
    }), interpreter)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(interpreted)
    expect(interpreter).toHaveBeenCalledWith("Two hours of gravel with a brewery")
  })

  it("rejects blank or oversized prompts before invoking a model", async () => {
    const interpreter = vi.fn(async () => interpreted)
    const blank = await handleRideIntentRequest(new Request("http://test/api/ride-intent", {
      method: "POST",
      body: JSON.stringify({ prompt: " " })
    }), interpreter)
    const oversized = await handleRideIntentRequest(new Request("http://test/api/ride-intent", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: JSON.stringify({ prompt: "route" })
    }), interpreter)

    expect(blank.status).toBe(400)
    expect(oversized.status).toBe(413)
    expect(interpreter).not.toHaveBeenCalled()
  })
})
