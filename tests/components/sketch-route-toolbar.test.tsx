import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SketchRouteToolbar } from "@/components/planner/v2/SketchRouteToolbar"

describe("SketchRouteToolbar", () => {
  it("exposes the compact V2 draw actions with safe disabled states", () => {
    const onUndo = vi.fn()
    const onClear = vi.fn()
    const onDone = vi.fn()
    const onCancel = vi.fn()

    render(
      <SketchRouteToolbar
        canUndo={false}
        canFinish={false}
        onUndo={onUndo}
        onClear={onClear}
        onDone={onDone}
        onCancel={onCancel}
      />
    )

    expect(screen.getByRole("toolbar", { name: "Draw route controls" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Undo drawing point" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Clear drawing" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Finish drawing" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel drawing" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Clear drawing" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel drawing" }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("allows Undo and Done when the gesture has usable geometry", () => {
    const onUndo = vi.fn()
    const onDone = vi.fn()

    render(
      <SketchRouteToolbar
        canUndo
        canFinish
        onUndo={onUndo}
        onClear={vi.fn()}
        onDone={onDone}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Undo drawing point" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish drawing" }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })
})
