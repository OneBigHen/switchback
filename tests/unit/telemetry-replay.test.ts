import { describe, expect, it } from "vitest"
import {
  createTelemetrySessionRecordingOptions,
  REPLAY_BLOCK_SELECTOR
} from "@/lib/telemetry/replay"

describe("telemetry replay boundaries", () => {
  it("blocks file inputs even if a future component misses a local marker", () => {
    expect(REPLAY_BLOCK_SELECTOR).toContain('input[type="file"]')
    expect(createTelemetrySessionRecordingOptions().blockSelector).toContain('input[type="file"]')
  })
})
