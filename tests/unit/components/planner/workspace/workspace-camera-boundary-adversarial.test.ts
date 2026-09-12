import { describe, expect, it } from "vitest"
import {
  calculateMapViewportInsets,
  calculateNavigationFollowInsets
} from "@/components/planner/workspace/map-viewport-insets"
import {
  resolveWorkspaceMode,
  WORKSPACE_COMPACT_MAX_WIDTH_PX,
  WORKSPACE_MEDIUM_MAX_WIDTH_PX
} from "@/components/planner/workspace/workspace-mode"

describe("workspace camera boundary authority", () => {
  it("keeps the exact compact ceiling on compact follow-camera geometry", () => {
    const width = WORKSPACE_COMPACT_MAX_WIDTH_PX
    expect(resolveWorkspaceMode(width)).toBe("compact")
    expect(calculateNavigationFollowInsets({ viewportWidthPx: width, viewportHeightPx: 900 }))
      .toEqual({ top: 220, right: 28, bottom: 92, left: 28 })
  })

  it("moves to non-compact follow-camera geometry immediately above the compact ceiling", () => {
    const width = WORKSPACE_COMPACT_MAX_WIDTH_PX + 1
    expect(resolveWorkspaceMode(width)).toBe("medium")
    expect(calculateNavigationFollowInsets({ viewportWidthPx: width, viewportHeightPx: 900 }))
      .toEqual({ top: 150, right: 88, bottom: 100, left: 430 })
  })

  it("keeps route-fit topology aligned with compact, medium, and wide workspace boundaries", () => {
    const cases = [
      {
        width: WORKSPACE_COMPACT_MAX_WIDTH_PX,
        mode: "compact",
        expected: { top: 90, right: 34, bottom: 450, left: 34 }
      },
      {
        width: WORKSPACE_COMPACT_MAX_WIDTH_PX + 1,
        mode: "medium",
        expected: { top: 80, right: 70, bottom: 80, left: 500 }
      },
      {
        width: 768,
        mode: "medium",
        expected: { top: 80, right: 70, bottom: 80, left: 500 }
      },
      {
        width: WORKSPACE_MEDIUM_MAX_WIDTH_PX,
        mode: "medium",
        expected: { top: 80, right: 70, bottom: 80, left: 500 }
      },
      {
        width: WORKSPACE_MEDIUM_MAX_WIDTH_PX + 1,
        mode: "wide",
        expected: { top: 80, right: 70, bottom: 80, left: 500 }
      }
    ] as const

    for (const { width, mode, expected } of cases) {
      expect(resolveWorkspaceMode(width)).toBe(mode)
      expect(calculateMapViewportInsets({
        viewportWidthPx: width,
        viewportHeightPx: 900,
        mode: "planning"
      })).toEqual(expected)
    }
  })

  it("uses application width for topology even when the drawable map canvas is narrower", () => {
    expect(calculateMapViewportInsets({
      viewportWidthPx: 420,
      viewportHeightPx: 1024,
      workspaceWidthPx: 768,
      mode: "planning"
    })).toEqual({ top: 80, right: 70, bottom: 80, left: 500 })
  })
})
