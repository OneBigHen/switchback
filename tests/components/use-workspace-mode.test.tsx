import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useWorkspaceMode } from "@/components/planner/workspace/use-workspace-mode"

const ORIGINAL_WIDTH = window.innerWidth

function resizeTo(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  })
  window.dispatchEvent(new Event("resize"))
}

afterEach(() => {
  resizeTo(ORIGINAL_WIDTH)
})

describe("useWorkspaceMode", () => {
  it("tracks the canonical 760/761 and 1180/1181 boundaries reactively", () => {
    resizeTo(760)
    const { result } = renderHook(() => useWorkspaceMode())
    expect(result.current).toBe("compact")

    act(() => resizeTo(761))
    expect(result.current).toBe("medium")

    act(() => resizeTo(1180))
    expect(result.current).toBe("medium")

    act(() => resizeTo(1181))
    expect(result.current).toBe("wide")
  })

  it("moves back to compact when a tablet or desktop window narrows", () => {
    resizeTo(1024)
    const { result } = renderHook(() => useWorkspaceMode())
    expect(result.current).toBe("medium")

    act(() => resizeTo(700))
    expect(result.current).toBe("compact")
  })
})
