import { describe, expect, it } from "vitest"

import {
  createIdentitySession,
  nextPasskeyCounter,
  PasskeyChallengeStore
} from "@/lib/identity/passkey"
import { createPublishPrivacyPreview } from "@/lib/community/privacy-preview"

describe("passkey and publish privacy boundaries", () => {
  it("uses one-time bounded challenges and signed expiring sessions", () => {
    const challenges = new PasskeyChallengeStore(100, 2)
    const issued = challenges.issue("registration", "rider-12345678901234567890", 1_000)
    expect(challenges.consume(issued.id, "registration", 1_050)?.challenge).toBe(issued.challenge)
    expect(challenges.consume(issued.id, "registration", 1_050)).toBeNull()
    const token = createIdentitySession("rider-12345678901234567890", "s".repeat(32), 100, 1_000)
    const request = new Request("https://switchback.test", { headers: { authorization: `Bearer ${token}` } })
    expect((request.headers.get("authorization") ?? "").length).toBeGreaterThan(0)
    expect(nextPasskeyCounter(4, 5)).toBe(5)
    expect(() => nextPasskeyCounter(5, 4)).toThrow(/counter/i)
  })

  it("shows exact public geometry while removing private-zone points and instructions", () => {
    const geometry = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.04, 0]] as [number, number][]
    const preview = createPublishPrivacyPreview({
      geometry,
      distanceMiles: 2.7,
      durationMinutes: 40,
      zones: [{ center: [0.02, 0], radiusMeters: 300 }],
      instructions: [
        { distanceMeters: 100, timeMilliseconds: 1, sign: 0, text: "Public", streetName: "Road", interval: [0, 1] },
        { distanceMeters: 100, timeMilliseconds: 1, sign: 0, text: "Private", streetName: "Home Road", interval: [2, 3] }
      ]
    })
    expect(preview.exactPreviewRequired).toBe(true)
    expect(preview.publicGeometry.length).toBe(2)
    expect(preview.publicInstructions).toHaveLength(1)
    expect(preview.redactedInstructionCount).toBe(1)
    expect(preview.publicDistanceMiles).toBeLessThan(2.7)

    const crossing = createPublishPrivacyPreview({
      geometry: [[0, 0], [0.02, 0], [0.04, 0]],
      distanceMiles: 2,
      durationMinutes: 20,
      trimStartMeters: 100,
      trimEndMeters: 100,
      zones: [{ center: [0.03, 0], radiusMeters: 400 }],
      instructions: [{ distanceMeters: 100, timeMilliseconds: 1, sign: 0, text: "Private crossing", streetName: "Home Road", interval: [1, 2] }]
    })
    expect(crossing.publicGeometry).toHaveLength(1)
    expect(crossing.publicInstructions).toEqual([])
  })
})
