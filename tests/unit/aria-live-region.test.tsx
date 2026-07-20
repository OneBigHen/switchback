import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AriaLiveRegion } from "@/components/planner/a11y"

describe("AriaLiveRegion", () => {
  it.each([
    { politeness: "off" as const, role: null, ariaLive: null },
    { politeness: "polite" as const, role: "status", ariaLive: "polite" },
    { politeness: "assertive" as const, role: "alert", ariaLive: "assertive" }
  ])("renders $politeness announcements with the expected ARIA attributes", ({ politeness, role, ariaLive }) => {
    const { container } = render(
      <AriaLiveRegion id={`region-${politeness}`} politeness={politeness} message="Route updated" />
    )

    const region = container.querySelector(`#region-${politeness}`)
    expect(region).not.toBeNull()
    expect(region).toHaveTextContent("Route updated")

    if (ariaLive) expect(region).toHaveAttribute("aria-live", ariaLive)
    else expect(region).not.toHaveAttribute("aria-live")

    if (role) expect(screen.getByRole(role)).toBe(region)
    else expect(region).not.toHaveAttribute("role")
  })
})
