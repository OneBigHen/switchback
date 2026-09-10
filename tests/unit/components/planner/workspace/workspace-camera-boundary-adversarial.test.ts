import { describe, expect, it } from "vitest"
import {
  calculateNavigationFollowInsets
} from "@/components/planner/workspace/map-viewport-insets"
import {
  resolveWorkspaceMode,
  WORKSPACE_COMPACT_MAX_WIDTH_PX
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
})
