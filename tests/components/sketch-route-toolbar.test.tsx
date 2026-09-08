import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SketchRouteToolbar } from "@/components/planner/v2/SketchRouteToolbar"

afterEach(cleanup)

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
    expect(screen.getByRole("button", { name: "Finish drawing and plan route" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel drawing" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Use route fields instead" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Clear drawing" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel drawing" }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("allows Undo and Plan route when the gesture has usable geometry", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Finish drawing and plan route" }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("offers Retry after a failed sketch without changing the draft controls", () => {
    const onDone = vi.fn()
    render(
      <SketchRouteToolbar
        canUndo
        canFinish
        retry
        onUndo={vi.fn()}
        onClear={vi.fn()}
        onDone={onDone}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry drawing route" }))
    expect(onDone).toHaveBeenCalledOnce()
    expect(screen.getByText("Retry route")).toBeInTheDocument()
  })

  it("cancels draw mode with Escape so keyboard users cannot become trapped", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <SketchRouteToolbar
        canUndo
        canFinish
        onUndo={vi.fn()}
        onClear={vi.fn()}
        onDone={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.keyboard("{Escape}")
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("keeps every escape hatch live while a drawn route is still planning", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onDone = vi.fn()
    const onClear = vi.fn()

    render(
      <SketchRouteToolbar
        canUndo
        canFinish
        busy
        onUndo={vi.fn()}
        onClear={onClear}
        onDone={onDone}
        onCancel={onCancel}
      />
    )

    // The work in flight is protected; the rider never is.
    expect(screen.getByRole("button", { name: "Undo drawing point" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Clear drawing" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Finish drawing and plan route" })).toBeDisabled()
    expect(screen.getByText("Planning…")).toBeInTheDocument()

    const cancel = screen.getByRole("button", { name: "Cancel drawing" })
    const fields = screen.getByRole("button", { name: "Use route fields instead" })
    expect(cancel).toBeEnabled()
    expect(fields).toBeEnabled()

    await user.click(cancel)
    await user.click(fields)
    await user.keyboard("{Escape}")

    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onDone).not.toHaveBeenCalled()
    expect(onClear).not.toHaveBeenCalled()
  })

  it("offers a keyboard-operable alternative that returns to route fields", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <SketchRouteToolbar
        canUndo={false}
        canFinish={false}
        onUndo={vi.fn()}
        onClear={vi.fn()}
        onDone={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole("button", { name: "Use route fields instead" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
