import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContextSheet } from "@/components/planner/workspace/ContextSheet"

afterEach(cleanup)

function renderSheet(detent: "peek" | "half" | "full", onDetentChange: (next: "peek" | "half" | "full") => void) {
  return render(
    <ContextSheet
      id="planner-sheet"
      label="Motorcycle route planner"
      detent={detent}
      onDetentChange={onDetentChange}
    >
      <p>Planner content</p>
    </ContextSheet>
  )
}

describe("ContextSheet", () => {
  it("exposes its detent and a keyboard-accessible expand action at half", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    renderSheet("half", onDetentChange)

    expect(screen.getByRole("complementary", { name: "Motorcycle route planner" }))
      .toHaveAttribute("data-sheet-detent", "half")
    expect(screen.getByText("Planner content")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /expand planner sheet/i }))
    expect(onDetentChange).toHaveBeenCalledWith("full")
  })

  it("reaches full through real keyboard activation of the handle (UX-003)", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    renderSheet("half", onDetentChange)

    const handle = screen.getByRole("button", { name: /expand planner sheet/i })
    await user.tab()
    expect(handle).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(onDetentChange).toHaveBeenCalledWith("full")
  })

  it("collapses from full back to half through the same handle", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    renderSheet("full", onDetentChange)

    expect(screen.getByRole("complementary", { name: "Motorcycle route planner" }))
      .toHaveAttribute("data-sheet-detent", "full")
    await user.click(screen.getByRole("button", { name: /collapse planner sheet/i }))
    expect(onDetentChange).toHaveBeenCalledWith("half")
  })

  it("commits one upward detent on pointer release without a follow-up click", () => {
    const onDetentChange = vi.fn()

    renderSheet("half", onDetentChange)

    const handle = screen.getByRole("button", { name: /expand planner sheet/i })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400, pointerType: "touch" })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 368, pointerType: "touch" })
    expect(onDetentChange).toHaveBeenCalledWith("full")
  })

  it("commits one downward detent on pointer release without a follow-up click", () => {
    const onDetentChange = vi.fn()

    renderSheet("half", onDetentChange)

    const handle = screen.getByRole("button", { name: /expand planner sheet/i })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 300, pointerType: "touch" })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 332, pointerType: "touch" })
    expect(onDetentChange).toHaveBeenCalledWith("peek")
  })

  it("keeps the peek surface usable without exposing the full sheet body", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    render(
      <ContextSheet
        id="planner-sheet"
        label="Motorcycle route planner"
        detent="peek"
        onDetentChange={onDetentChange}
        peekContent={<span>Peek summary</span>}
      >
        <p>Planner content</p>
      </ContextSheet>
    )

    expect(screen.getByRole("complementary", { name: "Motorcycle route planner" }))
      .toHaveAttribute("data-sheet-state", "collapsed")
    expect(screen.queryByText("Planner content")).not.toBeInTheDocument()
    expect(screen.getByText("Peek summary")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Expand planner sheet" }))
    expect(onDetentChange).toHaveBeenCalledWith("half")
  })

  it("walks the whole ladder peek → half → full through successive UI interactions", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()
    const { rerender } = render(
      <ContextSheet
        id="planner-sheet"
        label="Motorcycle route planner"
        detent="peek"
        onDetentChange={onDetentChange}
        peekContent={<span>Peek summary</span>}
      >
        <p>Planner content</p>
      </ContextSheet>
    )

    // peek → half via the expand control.
    await user.click(screen.getByRole("button", { name: "Expand planner sheet" }))
    expect(onDetentChange).toHaveBeenCalledWith("half")

    rerender(
      <ContextSheet
        id="planner-sheet"
        label="Motorcycle route planner"
        detent="half"
        onDetentChange={onDetentChange}
      >
        <p>Planner content</p>
      </ContextSheet>
    )

    // half → full via the handle.
    await user.click(screen.getByRole("button", { name: /expand planner sheet/i }))
    expect(onDetentChange).toHaveBeenCalledWith("full")
  })
})
