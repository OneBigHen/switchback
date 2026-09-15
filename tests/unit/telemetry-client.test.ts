import { describe, expect, it, vi } from "vitest"
import type { CaptureResult } from "posthog-js"
import { resolveTelemetryConfig } from "@/lib/telemetry/config"
import { writeTelemetryAcknowledgement } from "@/lib/telemetry/consent"
import { createTelemetryController } from "@/lib/telemetry/client"

function configured() {
  return resolveTelemetryConfig({
    TELEMETRY_ENABLED: "true",
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
    NEXT_PUBLIC_POSTHOG_HOST: "https://telemetry.example.test",
    NEXT_PUBLIC_OPENGRAVEL_RELEASE: "beta",
    NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA: "abc123",
    NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID: "deploy-7",
    NODE_ENV: "production"
  })
}

function fakeSdk() {
  const sdk = {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn()
  }
  sdk.init.mockReturnValue(sdk)
  return sdk
}

describe("telemetry SDK boundary", () => {
  it("does not initialize or capture until an accepted acknowledgement exists", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)

    expect(controller.initialize(configured(), null)).toBe("waiting-for-acknowledgement")
    controller.capture("app_opened", { entry_surface: "plan" })
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()
  })

  it("initializes the configured SDK with replay, autocapture, performance and final scrubbing", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const acknowledgement = writeTelemetryAcknowledgement(null, "accepted", "2026-09-14T13:00:00.000Z")

    expect(controller.initialize(configured(), acknowledgement)).toBe("initialized")
    expect(sdk.init).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      api_host: "https://telemetry.example.test",
      capture_pageview: "history_change",
      capture_pageleave: "if_capture_pageview",
      capture_heatmaps: true,
      capture_dead_clicks: true,
      capture_exceptions: true,
      capture_performance: { network_timing: true, web_vitals: true },
      opt_out_capturing_by_default: true,
      session_recording: expect.objectContaining({
        maskAllInputs: true,
        recordHeaders: false,
        recordBody: false,
        captureCanvas: { recordCanvas: false },
        canvasCapture: expect.objectContaining({ maskRegionsFn: expect.any(Function) }),
        maskCapturedNetworkRequestFn: expect.any(Function)
      }),
      before_send: expect.any(Function)
    }), "opengravel")
    expect(sdk.opt_in_capturing).toHaveBeenCalledOnce()
  })

  it("adds release context to semantic events and remains non-fatal when PostHog fails", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const acknowledgement = writeTelemetryAcknowledgement(null, "accepted", "2026-09-14T13:00:00.000Z")
    controller.initialize(configured(), acknowledgement)

    controller.capture("app_opened", { entry_surface: "plan" })
    expect(sdk.capture).toHaveBeenCalledWith("app_opened", expect.objectContaining({
      app_release: "beta",
      build_sha: "abc123",
      deployment_id: "deploy-7",
      telemetry_schema_version: "1",
      entry_surface: "plan"
    }))

    sdk.capture.mockImplementation(() => {
      throw new Error("PostHog is unavailable")
    })
    expect(() => controller.capture("app_opened", { entry_surface: "plan" })).not.toThrow()
  })

  it("adds one opaque page session id to every completed workflow span", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const acknowledgement = writeTelemetryAcknowledgement(null, "accepted", "2026-09-14T13:00:00.000Z")
    controller.initialize(configured(), acknowledgement)

    const span = controller.startWorkflow("planner_to_first_routes", { route_mode: "best-ride" })
    expect(span?.end()).toBe(true)

    const completed = sdk.capture.mock.calls.find(([eventName]) => eventName === "workflow_span_completed")
    expect(completed?.[1]).toEqual(expect.objectContaining({
      workflow: "planner_to_first_routes",
      session_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^session-/i)
    }))
  })

  it("uses only opaque identity and resets on logout", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const acknowledgement = writeTelemetryAcknowledgement(null, "accepted", "2026-09-14T13:00:00.000Z")
    controller.initialize(configured(), acknowledgement)

    controller.identify("rider-abcdefghijklmnopqrst", { device_class: "mobile", tester_role: "owner" })
    controller.identify("tester@example.com", { device_class: "desktop" })
    controller.resetIdentity()

    expect(sdk.identify).toHaveBeenCalledWith("rider-abcdefghijklmnopqrst", {
      device_class: "mobile",
      tester_role: "owner"
    })
    expect(sdk.identify).toHaveBeenCalledTimes(1)
    expect(sdk.reset).toHaveBeenCalledOnce()
    expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(2)
  })

  it("applies the final before-send scrubber to serialized event data", () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const acknowledgement = writeTelemetryAcknowledgement(null, "accepted", "2026-09-14T13:00:00.000Z")
    controller.initialize(configured(), acknowledgement)
    const options = sdk.init.mock.calls[0]?.[1]
    const beforeSend = options?.before_send
    const result = beforeSend?.({
      uuid: "event-id",
      event: "route_plan_succeeded",
      properties: { coordinates: [[-75.2, 40.1]], route_mode: "best-ride" }
    } as CaptureResult)

    expect(result?.properties).toEqual({ route_mode: "best-ride", token: "phc_test" })
  })
})
