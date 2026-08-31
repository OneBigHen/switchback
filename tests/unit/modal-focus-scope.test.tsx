import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ModalFocusScope } from "@/components/planner/a11y/ModalFocusScope"

describe("ModalFocusScope", () => {
  it("focuses the first control, traps Tab, closes on Escape, and restores focus", () => {
    const onEscape = vi.fn()
    const launcher = document.createElement("button")
    launcher.textContent = "Launcher"
    document.body.append(launcher)
    launcher.focus()

    const view = render(
      <ModalFocusScope onEscape={onEscape}>
        <button>First</button>
        <button>Last</button>
      </ModalFocusScope>
    )
    const first = screen.getByRole("button", { name: "First" })
    const last = screen.getByRole("button", { name: "Last" })
    expect(first).toHaveFocus()

    last.focus()
    fireEvent.keyDown(last, { key: "Tab" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: "Escape" })
    expect(onEscape).toHaveBeenCalledOnce()

    view.unmount()
    expect(launcher).toHaveFocus()
    launcher.remove()
  })
})
