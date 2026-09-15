import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TelemetryAcknowledgement } from "@/components/telemetry/TelemetryAcknowledgement"

describe("TelemetryAcknowledgement", () => {
  afterEach(cleanup)

  it("explains the hosted beta collection scope and links the public specification", () => {
    render(<TelemetryAcknowledgement onAccept={vi.fn()} onDecline={vi.fn()} />)

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Help us improve OpenGravel")
    expect(screen.getByText(/session recordings/i)).toBeInTheDocument()
    expect(screen.getByText(/IP\/approximate network location/i)).toBeInTheDocument()
    expect(screen.getByText(/passwords, passkeys, tokens, raw GPX files/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /read the telemetry specification/i })).toHaveAttribute(
      "href",
      expect.stringContaining("2026-09-14-posthog-dev-observability-design.md")
    )
  })

  it("requires an explicit choice and reports the choice to the gate", () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()
    render(<TelemetryAcknowledgement onAccept={onAccept} onDecline={onDecline} />)

    fireEvent.click(screen.getByRole("button", { name: /acknowledge and continue/i }))
    fireEvent.click(screen.getByRole("button", { name: /continue without telemetry/i }))

    expect(onAccept).toHaveBeenCalledOnce()
    expect(onDecline).toHaveBeenCalledOnce()
  })
})
