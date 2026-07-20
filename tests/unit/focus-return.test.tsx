import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FocusReturn } from "@/components/planner/a11y"

function FocusHarness({ mounted }: { mounted: boolean }) {
  return (
    <div>
      <button type="button">Open planner layer</button>
      <button type="button">Temporary focus</button>
      {mounted ? <FocusReturn /> : null}
    </div>
  )
}

describe("FocusReturn", () => {
  it("returns focus to the element that was active when it mounted", () => {
    const { getByText, rerender } = render(<FocusHarness mounted={false} />)
    const trigger = getByText("Open planner layer")
    const temporary = getByText("Temporary focus")

    trigger.focus()
    rerender(<FocusHarness mounted={true} />)
    temporary.focus()
    rerender(<FocusHarness mounted={false} />)

    expect(document.activeElement).toBe(trigger)
  })
})
