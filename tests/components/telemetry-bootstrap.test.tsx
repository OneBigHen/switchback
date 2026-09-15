import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TelemetryBootstrap } from "@/components/telemetry/TelemetryBootstrap"
import { resolveTelemetryConfig } from "@/lib/telemetry/config"
import { TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY } from "@/lib/telemetry/consent"
import { createTelemetryController, type TelemetrySdk } from "@/lib/telemetry/client"

function configured() {
  return resolveTelemetryConfig({
    TELEMETRY_ENABLED: "true",
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
    NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA: "abc123",
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
  return sdk as unknown as TelemetrySdk
}

describe("TelemetryBootstrap", () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it("keeps PostHog stopped until the rider acknowledges the hosted beta notice", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const user = userEvent.setup()

    render(
      <TelemetryBootstrap
        initialConfig={configured()}
        loadConfig={async () => configured()}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    expect(screen.getByText("planner content")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    expect(sdk.init).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: /acknowledge and continue/i }))

    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.capture).toHaveBeenNthCalledWith(1, "beta_telemetry_acknowledged", expect.objectContaining({
      acknowledgement_version: "2026-09-14.v1"
    }))
    expect(sdk.capture).toHaveBeenNthCalledWith(2, "app_opened", expect.any(Object))
    expect(window.localStorage.getItem(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY)).toContain('"accepted"')
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("allows the app to continue with no SDK startup when telemetry is declined", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const user = userEvent.setup()

    render(
      <TelemetryBootstrap
        initialConfig={configured()}
        loadConfig={async () => configured()}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /continue without telemetry/i }))

    expect(sdk.init).not.toHaveBeenCalled()
    expect(screen.getByText("planner content")).toBeInTheDocument()
    expect(window.localStorage.getItem(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY)).toContain('"declined"')
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("records a browser offline transition after telemetry is acknowledged", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const user = userEvent.setup()

    render(
      <TelemetryBootstrap
        initialConfig={configured()}
        loadConfig={async () => configured()}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /acknowledge and continue/i }))
    fireEvent(window, new Event("offline"))

    expect(sdk.capture).toHaveBeenCalledWith("offline_mode_entered", expect.objectContaining({
      offline_reason: "browser-offline"
    }))
  })

  it("records background and resume transitions with bounded durations", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const user = userEvent.setup()
    let visibility: "visible" | "hidden" = "visible"
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility
    })

    render(
      <TelemetryBootstrap
        initialConfig={configured()}
        loadConfig={async () => configured()}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /acknowledge and continue/i }))
    visibility = "hidden"
    fireEvent(document, new Event("visibilitychange"))
    visibility = "visible"
    fireEvent(document, new Event("visibilitychange"))

    expect(sdk.capture).toHaveBeenCalledWith("app_backgrounded", expect.objectContaining({
      foreground_duration_ms: expect.any(Number)
    }))
    expect(sdk.capture).toHaveBeenCalledWith("app_resumed", expect.objectContaining({
      background_duration_ms: expect.any(Number)
    }))
  })

  it("records browser PWA install prompt and installation transitions after acknowledgement", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const user = userEvent.setup()

    render(
      <TelemetryBootstrap
        initialConfig={configured()}
        loadConfig={async () => configured()}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /acknowledge and continue/i }))
    fireEvent(window, new Event("beforeinstallprompt"))
    fireEvent(window, new Event("appinstalled"))

    expect(sdk.capture).toHaveBeenCalledWith("pwa_install_prompt_shown", expect.objectContaining({
      surface: "unknown"
    }))
    expect(sdk.capture).toHaveBeenCalledWith("pwa_installed", expect.objectContaining({
      surface: "unknown"
    }))
  })

  it("does not show a gate or make a PostHog call when the runtime is disabled", async () => {
    const sdk = fakeSdk()
    const controller = createTelemetryController(sdk)
    const disabled = resolveTelemetryConfig({})

    render(
      <TelemetryBootstrap
        initialConfig={disabled}
        loadConfig={async () => disabled}
        controller={controller}
      >
        <span>planner content</span>
      </TelemetryBootstrap>
    )

    await waitFor(() => expect(screen.getByText("planner content")).toBeInTheDocument())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(sdk.init).not.toHaveBeenCalled()
  })
})
