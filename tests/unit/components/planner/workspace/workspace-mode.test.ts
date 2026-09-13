import { describe, expect, it } from "vitest"
import {
  WORKSPACE_COMPACT_MAX_WIDTH_PX,
  WORKSPACE_MEDIUM_MAX_WIDTH_PX,
  isCompactWorkspaceWidth,
  resolveWorkspaceMode
} from "@/components/planner/workspace/workspace-mode"

/**
 * The canonical planner workspace-mode contract (issue #115).
 *
 * These boundaries are the single source of truth for React-driven planner
 * topology. Component-local `max-width: 760px` decisions must resolve through
 * here instead, so the map camera, the planner deck and the route renderer
 * cannot drift apart about how much screen the planner occupies.
 */
describe("resolveWorkspaceMode", () => {
  it("resolves compact at or below the compact ceiling", () => {
    for (const width of [0, 320, 390, 667, 700, 760]) {
      expect(resolveWorkspaceMode(width), `width ${width}`).toBe("compact")
    }
  })

  it("resolves medium above the compact ceiling and at or below the medium ceiling", () => {
    for (const width of [761, 768, 820, 1024, 1180]) {
      expect(resolveWorkspaceMode(width), `width ${width}`).toBe("medium")
    }
  })

  it("resolves wide above the medium ceiling", () => {
    for (const width of [1181, 1366, 1440, 2560]) {
      expect(resolveWorkspaceMode(width), `width ${width}`).toBe("wide")
    }
  })

  it("treats the exact boundaries as documented, with no gap or overlap", () => {
    // 760/761 and 1180/1181 are the only places the contract can be off by one.
    expect(resolveWorkspaceMode(WORKSPACE_COMPACT_MAX_WIDTH_PX)).toBe("compact")
    expect(resolveWorkspaceMode(WORKSPACE_COMPACT_MAX_WIDTH_PX + 1)).toBe("medium")
    expect(resolveWorkspaceMode(WORKSPACE_MEDIUM_MAX_WIDTH_PX)).toBe("medium")
    expect(resolveWorkspaceMode(WORKSPACE_MEDIUM_MAX_WIDTH_PX + 1)).toBe("wide")
  })

  it("exports the documented boundaries as the single source of truth", () => {
    expect(WORKSPACE_COMPACT_MAX_WIDTH_PX).toBe(760)
    expect(WORKSPACE_MEDIUM_MAX_WIDTH_PX).toBe(1180)
  })

  it("falls back to the single-pane layout for a non-measurable width", () => {
    // Server render, a detached container and a zero-width node all report a
    // width that carries no layout intent. Compact is the safe single-pane
    // fallback: it never renders two panes into a space that cannot hold them.
    for (const width of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1
    ]) {
      expect(resolveWorkspaceMode(width), `width ${String(width)}`).toBe("compact")
    }
  })
})

describe("isCompactWorkspaceWidth", () => {
  it("agrees with the resolver exactly", () => {
    for (const width of [0, 320, 390, 667, 700, 760, 761, 820, 1024, 1180, 1181, 1440]) {
      expect(isCompactWorkspaceWidth(width), `width ${width}`).toBe(
        resolveWorkspaceMode(width) === "compact"
      )
    }
  })
})
