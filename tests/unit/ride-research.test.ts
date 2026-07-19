import { describe, expect, it, vi } from "vitest"
import { researchRideIdea } from "@/lib/ai/ride-research"

describe("ride idea web research", () => {
  it("uses the server-only You API key and returns only safe source cards", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      results: {
        web: [
          {
            title: "PA Wilds scenic motorcycle ride",
            url: "https://example.test/pa-wilds",
            description: "A long scenic road with overlooks."
          },
          { title: "Unsafe", url: "javascript:alert(1)", description: "Nope" }
        ]
      }
    }))

    await expect(researchRideIdea("twisty lunch ride from New Hope", {
      apiKey: "test-key",
      fetcher
    })).resolves.toEqual([{
      title: "PA Wilds scenic motorcycle ride",
      url: "https://example.test/pa-wilds",
      summary: "A long scenic road with overlooks."
    }])
    expect(fetcher).toHaveBeenCalledWith("https://api.you.com/v1/search", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-api-key": "test-key" })
    }))
  })

  it("does not make a search request when web research is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(researchRideIdea("twisty lunch ride", { fetcher })).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
