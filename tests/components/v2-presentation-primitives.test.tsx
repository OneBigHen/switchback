import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DestinationHeader } from "@/components/v2/DestinationHeader"
import { RouteGraphic } from "@/components/v2/RouteGraphic"
import { SettingRow } from "@/components/v2/SettingRow"

afterEach(cleanup)

describe("V2 presentation primitives", () => {
  it("generates a deterministic, bounded route trace from stable object identity", () => {
    const { container, rerender } = render(<RouteGraphic seed="saved:pine-creek" variant="route" label="Pine Creek route trace" />)
    const firstPath = container.querySelector("[data-route-trace]")?.getAttribute("d")

    expect(screen.getByRole("img", { name: "Pine Creek route trace" })).toBeInTheDocument()
    expect(firstPath).toMatch(/^M/)
    const yValues = [...(firstPath?.matchAll(/[ML]\d+ (-?\d+)/g) ?? [])].map((match) => Number(match[1]))
    expect(yValues).toHaveLength(7)
    expect(yValues.every((value) => value >= 14 && value <= 68)).toBe(true)

    rerender(<RouteGraphic seed="saved:pine-creek" variant="route" label="Pine Creek route trace" />)
    expect(container.querySelector("[data-route-trace]")?.getAttribute("d")).toBe(firstPath)

    rerender(<RouteGraphic seed="saved:different-route" variant="route" label="Different route trace" />)
    expect(container.querySelector("[data-route-trace]")?.getAttribute("d")).not.toBe(firstPath)
  })

  it("keeps decorative graphics out of the accessibility tree", () => {
    const { container } = render(<RouteGraphic seed="library" variant="library" />)
    const graphic = container.querySelector("svg")
    expect(graphic).toHaveAttribute("aria-hidden", "true")
    expect(graphic).not.toHaveAttribute("role")
  })

  it("provides one strong destination hierarchy with optional actions and graphic", () => {
    render(
      <DestinationHeader
        eyebrow="Rider setup"
        title="Settings"
        description="Your motorcycle, route defaults, and Switchback preferences."
        graphic={<RouteGraphic seed="settings" variant="bike" />}
        actions={<button type="button">Add bike</button>}
      />
    )

    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument()
    expect(screen.getByText("Rider setup")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add bike" })).toBeInTheDocument()
  })

  it("renders setting controls as labelled rows rather than nested cards", () => {
    render(
      <SettingRow title="Voice guidance" description="Spoken prompts while riding.">
        <input aria-label="Voice guidance" type="checkbox" />
      </SettingRow>
    )

    const row = screen.getByRole("group", { name: "Voice guidance" })
    expect(row).toHaveAttribute("data-setting-row", "true")
    expect(screen.getByText("Spoken prompts while riding.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Voice guidance" })).toBeInTheDocument()
  })
})
