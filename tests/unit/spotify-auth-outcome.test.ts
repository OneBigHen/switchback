import { describe, expect, it } from "vitest"
import { spotifyAuthOutcomeMessage } from "@/lib/spotify/auth-outcome"

describe("Spotify callback outcome", () => {
  it("turns callback failures into a specific next step instead of an apparent sign-in loop", () => {
    expect(spotifyAuthOutcomeMessage("connection_failed")).toMatch(/could not finish/i)
    expect(spotifyAuthOutcomeMessage("client_configuration_failed")).toMatch(/configuration/i)
    expect(spotifyAuthOutcomeMessage("connected")).toMatch(/connected/i)
  })

  it("does not show a stale message for unrelated URLs", () => {
    expect(spotifyAuthOutcomeMessage(null)).toBeNull()
    expect(spotifyAuthOutcomeMessage("unknown")).toBeNull()
  })
})
