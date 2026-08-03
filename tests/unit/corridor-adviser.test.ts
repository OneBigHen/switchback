import { describe, expect, it, vi } from "vitest"
import { adviseCorridors, validateCorridorHints } from "@/lib/ai/corridor-adviser"
import type { CorridorAdviserInput } from "@/lib/ai/corridor-adviser"

const input: CorridorAdviserInput = {
  start: { lat: 40.1745, lon: -75.1059, label: "Hatboro" },
  finish: { lat: 40.4082, lon: -74.9792, label: "Stockton NJ" },
  targetMinutes: 120,
  character: "fun"
}

function structuredResponse(corridors: unknown, sources = [{ url: "https://example.test/pa" }]) {
  return Response.json({
    output: { content: { corridors }, type: "object" },
    sources
  })
}

const geocode = vi.fn(async (query: string) => {
  if (/river road/i.test(query)) return [{ lat: 40.35, lon: -75.1, label: "River Road" }]
  if (/ridge road/i.test(query)) return [{ lat: 40.45, lon: -75.2, label: "Ridge Road" }]
  return []
})

describe("corridor adviser transport", () => {
  it("posts a strict structured-output request to the Research API with the server-only key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => structuredResponse([]))
    await adviseCorridors(input, { apiKey: "test-key", fetcher, geocode })

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.you.com/v1/research",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key" })
      })
    )
    const body = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body)) as {
      research_effort?: string
      output_schema?: { required?: string[] }
    }
    expect(body.research_effort).toBe("standard")
    expect(body.output_schema?.required).toContain("corridors")
  })

  it("returns an empty no-key result without calling the API", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(adviseCorridors(input, { fetcher, geocode })).resolves.toEqual({
      hints: [],
      status: "no-key"
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns empty on timeout or cancellation without failing", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new DOMException("aborted", "AbortError")
    })
    await expect(adviseCorridors(input, { apiKey: "k", fetcher, geocode })).resolves.toEqual({
      hints: [],
      status: "timeout"
    })
  })

  it("returns empty on malformed structured output", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      output: { content: { corridors: [{ name: "no source" }] }, type: "object" },
      sources: []
    }))
    const result = await adviseCorridors(input, { apiKey: "k", fetcher, geocode })
    expect(result.hints).toEqual([])
    expect(["malformed", "empty"]).toContain(result.status)
  })
})

describe("corridor hint validation", () => {
  it("returns hints only when anchors geocode and source URLs are valid", async () => {
    const hints = await validateCorridorHints(
      [{
        name: "River Road",
        anchor: "River Road, Bucks County PA",
        crossings: null,
        tollRisk: "possible",
        rationale: "Classic Delaware valley river road with consistent sweepers.",
        sourceUrls: ["https://example.test/river-road", "javascript:alert(1)"]
      }],
      ["https://example.test/source"],
      geocode
    )
    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      name: "River Road",
      anchor: { lat: 40.35, lon: -75.1 },
      tollRisk: "possible"
    })
    expect(hints[0].sourceUrls).toEqual(["https://example.test/river-road", "https://example.test/source"])
  })

  it("discards hallucinated names whose anchors cannot be geocoded", async () => {
    const hints = await validateCorridorHints(
      [{
        name: "Ludicrous Lane",
        anchor: "Ludicrous Lane, Nowhere",
        crossings: null,
        tollRisk: "none",
        rationale: "Sounds twisty.",
        sourceUrls: ["https://example.test/ludicrous"]
      }],
      [],
      geocode
    )
    expect(hints).toEqual([])
  })

  it("discards hints with no valid source URL", async () => {
    const hints = await validateCorridorHints(
      [{
        name: "Ridge Road",
        anchor: "Ridge Road, Doylestown",
        crossings: null,
        tollRisk: "none",
        rationale: "A ridge line with good curves.",
        sourceUrls: ["javascript:alert(1)", "ftp://example.test/ridge"]
      }],
      [],
      geocode
    )
    expect(hints).toEqual([])
  })

  it("collapses duplicate nearby anchors and caps at three hints", async () => {
    const hints = await validateCorridorHints(
      [
        {
          name: "River Road",
          anchor: "River Road",
          crossings: null,
          tollRisk: "possible",
          rationale: "Sweepers along the river.",
          sourceUrls: ["https://example.test/river"]
        },
        {
          name: "River Road Scenic",
          anchor: "River Road Alternate",
          crossings: null,
          tollRisk: "possible",
          rationale: "Same river, different name.",
          sourceUrls: ["https://example.test/river-alt"]
        }
      ],
      [],
      geocode
    )
    expect(hints).toHaveLength(1)
  })
})
