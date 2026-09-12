import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  MAP_VIEWPORT_GUTTER_PX,
  calculateMapViewportInsets
} from "@/components/planner/workspace/map-viewport-insets"
import {
  WORKSPACE_COMPACT_MAX_WIDTH_PX,
  WORKSPACE_MEDIUM_MAX_WIDTH_PX
} from "@/components/planner/workspace/workspace-mode"

const adaptive = readFileSync(resolve(process.cwd(), "src/app/styles/adaptive-workspace.css"), "utf8")
const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8")
const tokens = readFileSync(resolve(process.cwd(), "src/app/styles/tokens.css"), "utf8")

function readRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`${selector} must have an adaptive workspace rule`)
  return match[1]
}

/**
 * Structural guard for issue #115's first real Medium workspace topology.
 * Behavioral geometry still belongs in tests/e2e/adaptive-workspace.spec.ts;
 * this fast contract prevents the old 761px == desktop-card fallback from
 * quietly becoming the implementation again.
 */
describe("adaptive Medium workspace CSS contract", () => {
  it("gives 761–1180px its own planner topology instead of inheriting the fixed desktop card", () => {
    expect(adaptive).toContain("@media (min-width: 761px) and (max-width: 1180px)")
    expect(adaptive).toContain("--sb-medium-planner-width:")
    expect(adaptive).toContain("--sb-medium-map-safe-left:")
    expect(adaptive).toContain("width: var(--sb-medium-planner-width);")
    expect(adaptive).toContain("left: var(--sb-medium-map-safe-left);")
  })

  it("keeps Medium planning notices and point-placement affordance inside the live-map budget", () => {
    const statusRule = readRule(adaptive, ".planner-shell:has(.planner-deck) .map-layer-status-stack")
    expect(statusRule).toContain("left: var(--sb-medium-map-safe-left);")
    expect(statusRule).toContain("right: 0;")
    expect(statusRule).toContain("transform: none;")

    const crosshairRule = readRule(adaptive, ".planner-shell:has(.planner-deck) .map-crosshair")
    expect(crosshairRule).toContain("left: var(--sb-medium-map-safe-left);")
    expect(crosshairRule).toContain("right: 0;")
    expect(crosshairRule).toContain("transform: translateY(-50%);")
  })

  it("moves Medium portrait navigation out of the map/planner side-by-side budget", () => {
    expect(adaptive).toContain("@media (min-width: 761px) and (max-width: 1180px) and (orientation: portrait)")
    expect(adaptive).toContain("height: var(--sb-mobile-nav-height);")
    expect(adaptive).toContain("flex-direction: row;")
    expect(adaptive).toContain("bottom: var(--sb-mobile-sheet-bottom);")
  })

  it("loads the adaptive authority after legacy planner and shell styles", () => {
    const adaptiveIndex = layout.indexOf('import "./styles/adaptive-workspace.css"')
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/planner-shell.css"'))
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/shell-v2.css"'))
    expect(adaptiveIndex).toBeGreaterThan(layout.indexOf('import "./styles/planner-command-surface.css"'))
  })

  it("keeps its media boundaries aligned with the workspace-mode authority", () => {
    expect(adaptive).toContain(
      `@media (min-width: ${WORKSPACE_COMPACT_MAX_WIDTH_PX + 1}px) and (max-width: ${WORKSPACE_MEDIUM_MAX_WIDTH_PX}px)`
    )
  })
})

/**
 * Cross-authority guard for the #115 Medium camera retune.
 *
 * `adaptive-workspace.css` owns the rendered Medium planner footprint, while
 * `map-viewport-insets.ts` re-derives the same geometry for route fitting from
 * duplicated numeric literals. Before this guard the only coupling between the
 * two authorities was a comment, so a CSS topology edit could silently desync
 * the camera from the panel the rider actually sees.
 *
 * These tests parse the CSS as the authority and drive the calculator with it,
 * so drift on either side fails here instead of only at the visual gate.
 */
const MEDIUM_PORTRAIT_MEDIA =
  "@media (min-width: 761px) and (max-width: 1180px) and (orientation: portrait)"

interface MediumFootprint {
  left: number
  min: number
  fraction: number
  max: number
}

function readPlannerWidthClamp(css: string, label: string): Omit<MediumFootprint, "left"> {
  const match = css.match(/--sb-medium-planner-width:\s*clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/)
  if (!match) throw new Error(`${label} must declare --sb-medium-planner-width as clamp(<px>, <vw>, <px>)`)
  return { min: Number(match[1]), fraction: Number(match[2]) / 100, max: Number(match[3]) }
}

function readPlannerLeft(css: string, label: string): number {
  const literal = css.match(/--sb-medium-planner-left:\s*(\d+)px/)
  if (literal) return Number(literal[1])
  const token = css.match(/--sb-medium-planner-left:\s*var\((--[\w-]+)\)/)
  if (!token) throw new Error(`${label} must declare --sb-medium-planner-left as px or var()`)
  const declared = tokens.match(new RegExp(`${token[1]}:\\s*(\\d+)px`))
  if (!declared) throw new Error(`${token[1]} must resolve to a px token in tokens.css`)
  return Number(declared[1])
}

function readMediumFootprint(): { landscape: MediumFootprint; portrait: MediumFootprint } {
  // The landscape block is declared first, so splitting on the portrait media
  // query keeps each clamp bound paired with the orientation that owns it
  // instead of matching the first declaration in the file twice.
  const portraitIndex = adaptive.indexOf(MEDIUM_PORTRAIT_MEDIA)
  if (portraitIndex < 0) throw new Error("adaptive-workspace.css must declare the Medium portrait media query")
  const landscapeCss = adaptive.slice(0, portraitIndex)
  const portraitCss = adaptive.slice(portraitIndex)
  return {
    landscape: { ...readPlannerWidthClamp(landscapeCss, "Medium landscape"), left: readPlannerLeft(landscapeCss, "Medium landscape") },
    portrait: { ...readPlannerWidthClamp(portraitCss, "Medium portrait"), left: readPlannerLeft(portraitCss, "Medium portrait") }
  }
}

describe("Medium camera math mirrors the rendered CSS planner footprint", () => {
  it("pins the approved landscape/portrait planner footprint literals", () => {
    const { landscape, portrait } = readMediumFootprint()
    expect(landscape).toEqual({ left: 96, min: 312, fraction: 0.34, max: 400 })
    expect(portrait).toEqual({ left: 16, min: 320, fraction: 0.42, max: 360 })
  })

  it("derives the Medium route-fit left inset from the CSS clamp at every viewport", () => {
    const { landscape, portrait } = readMediumFootprint()
    const cases = [
      { width: 761, height: 900 },
      { width: 768, height: 1024 },
      { width: 800, height: 800 },
      { width: 844, height: 390 },
      { width: 1024, height: 768 },
      { width: 1180, height: 400 },
      { width: 1180, height: 820 }
    ]

    for (const { width, height } of cases) {
      // CSS `orientation: portrait` matches square viewports (height >= width).
      const footprint = height >= width ? portrait : landscape
      const panelWidth = Math.min(
        footprint.max,
        Math.max(footprint.min, width * footprint.fraction)
      )
      const expectedLeft = Math.round(footprint.left + panelWidth + MAP_VIEWPORT_GUTTER_PX)
      const insets = calculateMapViewportInsets({
        viewportWidthPx: width,
        viewportHeightPx: height
      })
      expect(insets.left, `${width}x${height} Medium planning left inset`).toBe(expectedLeft)
    }
  })
})
