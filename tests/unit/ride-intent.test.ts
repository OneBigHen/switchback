import { describe, expect, it, vi } from "vitest"
import { interpretRidePrompt, parseRidePromptLocally } from "@/lib/ai/ride-intent"

describe("ride intent parser", () => {
  it("treats a concise place request as a destination from the rider's current location", () => {
    expect(parseRidePromptLocally("Costco")).toMatchObject({
      mode: "destination",
      destinationQuery: "Costco",
      profile: "scenic"
    })
  })

  it.each([
    ["New Hope, PA", "New Hope, PA"],
    ["123 Market St, Philadelphia, PA", "123 Market St, Philadelphia, PA"],
    ["Route me to Jim Thorpe", "Jim Thorpe"],
    ["Navigate to Pine Creek Gorge", "Pine Creek Gorge"],
    ["Plan a route to Gettysburg", "Gettysburg"],
    ["Scenic backroads to Jim Thorpe", "Jim Thorpe"]
  ])("keeps a geocodable destination in %s", (prompt, destination) => {
    expect(parseRidePromptLocally(prompt)).toMatchObject({
      mode: "destination",
      destinationQuery: destination
    })
  })

  it("preserves city and state qualifiers for both ends of an A-to-B request", () => {
    expect(parseRidePromptLocally(
      "Plan a scenic route from Carlisle, PA to Wellsboro, PA"
    )).toMatchObject({
      mode: "destination",
      startQuery: "Carlisle, PA",
      destinationQuery: "Wellsboro, PA",
      profile: "scenic"
    })
  })

  it.each([
    "Route from my current location to New Hope, PA",
    "Take me from here to New Hope, PA"
  ])("uses GPS rather than geocoding current-location shorthand in %s", (prompt) => {
    expect(parseRidePromptLocally(prompt)).toMatchObject({
      mode: "destination",
      startQuery: null,
      destinationQuery: "New Hope, PA"
    })
  })

  it("turns a timeboxed gravel and brewery request into a loop intent", () => {
    expect(parseRidePromptLocally(
      "I have two hours. Find gravel and a good brewery, then bring me home."
    )).toMatchObject({
      mode: "loop",
      profile: "adventure",
      targetMinutes: 120,
      destinationQuery: null,
      stopQuery: "brewery",
      preferGravel: true,
      avoidHighways: false,
      source: "local"
    })
  })

  it("extracts a destination and curvy-road preference from plain language", () => {
    expect(parseRidePromptLocally(
      "Take me to Jim Thorpe on twisty backroads and avoid highways"
    )).toMatchObject({
      mode: "destination",
      profile: "twisty",
      destinationQuery: "Jim Thorpe",
      stopQuery: null,
      preferGravel: false,
      avoidHighways: true
    })
  })

  it("recognizes natural alternatives to saying avoid highways", () => {
    expect(parseRidePromptLocally(
      "Take me to Lancaster, fastest route but stay off interstates"
    )).toMatchObject({
      mode: "destination",
      profile: "quick",
      destinationQuery: "Lancaster",
      avoidHighways: true
    })
  })

  it.each([
    [
      "Take me to Wellsboro avoiding highways",
      { destinationQuery: "Wellsboro", profile: "scenic", avoidHighways: true }
    ],
    [
      "Take me to Wellsboro fastest route",
      { destinationQuery: "Wellsboro", profile: "quick", avoidHighways: false }
    ],
    [
      "Where is Jim Thorpe?",
      { destinationQuery: "Jim Thorpe", profile: "scenic", avoidHighways: false }
    ],
    [
      "Costco near me",
      { destinationQuery: "Costco", profile: "scenic", avoidHighways: false }
    ]
  ])("normalizes destination language in %s", (prompt, expected) => {
    expect(parseRidePromptLocally(prompt)).toMatchObject({
      mode: "destination",
      ...expected
    })
  })

  it("understands minutes and common ride-stop requests", () => {
    expect(parseRidePromptLocally(
      "Make me a scenic 90 minute loop with coffee"
    )).toMatchObject({
      mode: "loop",
      profile: "scenic",
      targetMinutes: 90,
      stopQuery: "coffee"
    })
  })

  it("uses a fuzzy place from the prompt without requiring GPS", () => {
    expect(parseRidePromptLocally(
      "Build a two hour gravel loop from Carlisle with a brewery stop"
    )).toMatchObject({
      mode: "loop",
      profile: "adventure",
      targetMinutes: 120,
      startQuery: "Carlisle",
      stopQuery: "brewery"
    })
  })

  it("treats an open-ended ride request as a loop instead of using a stale destination", () => {
    expect(parseRidePromptLocally("Surprise me with scenic backroads")).toMatchObject({
      mode: "loop",
      profile: "scenic",
      destinationQuery: null
    })
  })

  it.each(["Home", "Take me home", "Navigate me home"]) (
    "preserves saved-home shorthand for explicit local resolution: %s",
    (prompt) => {
      expect(parseRidePromptLocally(prompt)).toMatchObject({
        mode: "destination",
        destinationQuery: "Home"
      })
    }
  )

  it("uses OpenRouter structured output when a key is configured", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            mode: "loop",
            profile: "adventure",
            targetMinutes: 150,
            startQuery: null,
            destinationQuery: null,
            stopQuery: "brewery",
            preferGravel: true,
            avoidHighways: true,
            summary: "A two-and-a-half hour gravel loop with a brewery stop"
          })
        }
      }]
    }), { status: 200 }))

    const intent = await interpretRidePrompt("Surprise me", {
      apiKey: "test-key",
      fetcher
    })

    expect(intent).toMatchObject({
      mode: "loop",
      profile: "adventure",
      targetMinutes: 150,
      stopQuery: "brewery",
      source: "openrouter"
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    )
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      model: "openrouter/free",
      response_format: { type: "json_schema" }
    })
  })

  it("rejects an OpenRouter destination intent that omitted its destination", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            mode: "destination",
            profile: "scenic",
            targetMinutes: null,
            startQuery: null,
            destinationQuery: null,
            stopQuery: null,
            preferGravel: false,
            avoidHighways: false,
            summary: "A scenic destination ride"
          })
        }
      }]
    }), { status: 200 }))

    const intent = await interpretRidePrompt("Surprise me with scenic backroads", {
      apiKey: "test-key",
      fetcher
    })

    expect(intent).toMatchObject({
      mode: "loop",
      destinationQuery: null,
      source: "local"
    })
  })

  it("falls back to the local parser when OpenRouter is unavailable", async () => {
    const intent = await interpretRidePrompt(
      "Give me a 60 minute curvy loop",
      {
        apiKey: "test-key",
        fetcher: vi.fn(async () => new Response("busy", { status: 503 }))
      }
    )

    expect(intent).toMatchObject({
      mode: "loop",
      profile: "twisty",
      targetMinutes: 60,
      source: "local"
    })
  })
})
