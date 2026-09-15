import { describe, expect, it } from "vitest"
import {
  DEFAULT_POSTHOG_HOST,
  TELEMETRY_ACKNOWLEDGEMENT_VERSION,
  getClientTelemetryConfig,
  resolveTelemetryConfig
} from "@/lib/telemetry/config"

describe("telemetry runtime configuration", () => {
  it("keeps telemetry disabled when the enable flag and project token are absent", () => {
    const config = resolveTelemetryConfig({})

    expect(config.enabled).toBe(false)
    expect(config.projectToken).toBe("")
    expect(config.apiHost).toBe(DEFAULT_POSTHOG_HOST)
  })

  it("requires both explicit enablement and a project token", () => {
    expect(resolveTelemetryConfig({ TELEMETRY_ENABLED: "true" }).enabled).toBe(false)
    expect(resolveTelemetryConfig({ NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test" }).enabled).toBe(false)
    expect(resolveTelemetryConfig({
      TELEMETRY_ENABLED: "true",
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test"
    }).enabled).toBe(true)
  })

  it("keeps the server-side enable flag authoritative and normalizes configured hosts", () => {
    const config = resolveTelemetryConfig({
      TELEMETRY_ENABLED: "false",
      NEXT_PUBLIC_TELEMETRY_ENABLED: "true",
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: " phc_test ",
      NEXT_PUBLIC_POSTHOG_HOST: "https://telemetry.example.test/",
      NEXT_PUBLIC_POSTHOG_UI_HOST: "https://ui.example.test/"
    })

    expect(config.enabled).toBe(false)
    expect(config.projectToken).toBe("phc_test")
    expect(config.apiHost).toBe("https://telemetry.example.test")
    expect(config.uiHost).toBe("https://ui.example.test")
  })

  it("allows the server-side flag to enable telemetry without a browser flag", () => {
    expect(resolveTelemetryConfig({
      TELEMETRY_ENABLED: "true",
      NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test"
    }).enabled).toBe(true)
  })

  it("exposes the same safe defaults to the browser without reading server secrets", () => {
    const config = getClientTelemetryConfig()

    expect(config.projectToken).toBe("")
    expect(config.acknowledgementVersion).toBe(TELEMETRY_ACKNOWLEDGEMENT_VERSION)
  })
})
