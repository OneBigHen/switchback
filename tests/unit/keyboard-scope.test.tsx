import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { KeyboardScope } from "@/components/planner/a11y"

describe("KeyboardScope", () => {
  it("calls onEscape once for Escape inside its subtree and stops propagation when requested", () => {
    const onEscape = vi.fn()
    const onOuterKeyDown = vi.fn()
    const { getByText } = render(
      <div onKeyDown={onOuterKeyDown}>
        <KeyboardScope onEscape={onEscape} stopPropagation={true}>
          <button type="button">Dismiss layer</button>
        </KeyboardScope>
      </div>
    )

    getByText("Dismiss layer").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))

    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(onOuterKeyDown).not.toHaveBeenCalled()
  })

  it("ignores non-Escape keys", () => {
    const onEscape = vi.fn()
    const { getByText } = render(
      <KeyboardScope onEscape={onEscape}>
        <button type="button">Keep layer</button>
      </KeyboardScope>
    )

    getByText("Keep layer").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    expect(onEscape).not.toHaveBeenCalled()
  })
})
