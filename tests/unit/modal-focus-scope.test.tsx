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

  it("preserves the rider's focused control when the escape callback identity changes", () => {
    const firstEscape = vi.fn()
    const view = render(
      <ModalFocusScope onEscape={firstEscape}>
        <button>First</button>
        <button>Last</button>
      </ModalFocusScope>
    )
    const last = screen.getByRole("button", { name: "Last" })
    last.focus()
    expect(last).toHaveFocus()

    const nextEscape = vi.fn()
    view.rerender(
      <ModalFocusScope onEscape={nextEscape}>
        <button>First</button>
        <button>Last</button>
      </ModalFocusScope>
    )

    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: "Escape" })
    expect(firstEscape).not.toHaveBeenCalled()
    expect(nextEscape).toHaveBeenCalledOnce()
  })
})
