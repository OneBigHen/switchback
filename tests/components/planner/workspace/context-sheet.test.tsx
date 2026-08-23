import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContextSheet } from "@/components/planner/workspace/ContextSheet"

afterEach(cleanup)

describe("ContextSheet", () => {
  it("exposes its detent and a keyboard-accessible collapse action", async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()

    render(
      <ContextSheet
        id="planner-sheet"
        label="Motorcycle route planner"
        detent="half"
        onDetentChange={onDetentChange}
      >
        <p>Planner content</p>
      </ContextSheet>
    )

    expect(screen.getByRole("complementary", { name: "Motorcycle route planner" }))
      .toHaveAttribute("data-sheet-detent", "half")
    expect(screen.getByText("Planner content")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /collapse planner sheet/i }))
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
})
