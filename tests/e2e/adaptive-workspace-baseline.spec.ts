import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { uxState } from "./helpers/ux-state-fixtures"

/**
 * Adaptive workspace BASELINE evidence harness (Train B / B1, issue #115).
 *
 * Captures the CURRENT binary phone/desktop layout BEFORE any adaptive
 * Compact/Medium/Wide topology work, so later topology changes can be reviewed
 * against measured truth instead of impressions.
 *
 * This is an EVIDENCE harness, not a CI regression gate: it records what it
 * finds (including absent selectors and unreachable states) rather than
 * asserting a target layout. The assertion matrix lives in
 * adaptive-workspace.spec.ts per the plan.
 *
 * Design notes:
 * - ONE TEST PER (viewport, state). A single mega-test previously consumed the
 *   whole file timeout on the first viewport, so a single slow state destroyed
 *   all other evidence. Per-capture tests isolate failure and preserve results.
 * - Each capture appends to the manifest immediately (read-modify-write), so a
 *   partial run still yields durable, honest evidence.
 *
 * Run on the dedicated runner, never on the shared dev container:
 *   /root/run-on-125.sh <worktree> test tests/e2e/adaptive-workspace-baseline.spec.ts \
 *     --project=desktop-chromium --reporter=line
 */

const EVIDENCE_DIR = path.join(
  process.cwd(),
  "docs",
  "quality",
  "sessions",
  "2026-09-10-adaptive-workspace-baseline"
)
const MANIFEST = path.join(EVIDENCE_DIR, "baseline-manifest.json")

const VIEWPORTS: Array<{ width: number; height: number; label: string }> = [
  { width: 390, height: 844, label: "390x844" },
  { width: 667, height: 375, label: "667x375" },
  { width: 700, height: 900, label: "700x900" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 820, height: 1180, label: "820x1180" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1180, height: 820, label: "1180x820" },
  { width: 1366, height: 1024, label: "1366x1024" },
  { width: 1440, height: 900, label: "1440x900" }
]

const STATES = ["search", "choose", "edit", "prepare"] as const
type BaselineState = (typeof STATES)[number]

/** Selectors grounded in the real component tree (verified by repo inspection). */
const SELECTORS = {
  mapStage: ".map-stage",
  mapCanvas: ".map-canvas",
  mapWorkspace: ".map-workspace",
  plannerDeck: ".planner-deck",
  scrollOwner: ".planner-scroll",
  layerControl: ".map-layer-control",
  attribution:
    ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib, .mapboxgl-ctrl-bottom-left .maplibregl-ctrl-attrib",
  navControls:
    ".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group",
  notice: ".provider-health-notice, .app-notice",
  plannerScrollOwners: ".planner-deck [class*='scroll'], .planner-deck .planner-scroll",
  visibleButtons: ".planner-deck button, .planner-peek-actions button"
} as const

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

function readManifest() {
  if (!existsSync(MANIFEST)) {
    return {
      generatedAt: new Date().toISOString(),
      note: "Adaptive workspace baseline (Train B / B1). Evidence, not a CI gate.",
      captures: [] as unknown[],
      gaps: [] as string[]
    }
  }
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"))
  } catch {
    return { generatedAt: new Date().toISOString(), captures: [], gaps: [] }
  }
}

function recordCapture(entry: Record<string, unknown>, gap?: string) {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const manifest = readManifest()
  manifest.generatedAt = new Date().toISOString()
  manifest.captures.push(entry)
  if (gap) manifest.gaps.push(gap)
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function measure(page: Page) {
  return page.evaluate((selectors) => {
    const boxOf = (selector: string): Rect | null => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }
    }

    const boxes: Record<string, Rect | null> = {}
    for (const [name, selector] of Object.entries(selectors)) {
      boxes[name] = boxOf(selector)
    }

    const doc = document.documentElement
    const overlap = (a: Rect, b: Rect): number => {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return w > 0 && h > 0 ? w * h : 0
    }

    // Only the real interactive MapLibre groups are compared: the corner
    // wrapper nodes span every child in that corner and would otherwise
    // report false overlaps (same approach as short-landscape-geometry.spec.ts).
    const collisionNames = ["attribution", "navControls", "layerControl", "notice"] as const
    const collisions: string[] = []
    for (let i = 0; i < collisionNames.length; i += 1) {
      for (let j = i + 1; j < collisionNames.length; j += 1) {
        const a = boxes[collisionNames[i]]
        const b = boxes[collisionNames[j]]
        if (a && b && overlap(a, b) > 0) collisions.push(`${collisionNames[i]}~${collisionNames[j]}`)
      }
    }

    const stage = boxes.mapStage ?? boxes.mapWorkspace
    const deck = boxes.plannerDeck
    const viewport = { width: innerWidth, height: innerHeight }
    let mapUnobstructedSq = stage ? stage.width * stage.height : 0
    if (stage && deck) {
      mapUnobstructedSq -= overlap(stage, deck)
      if (mapUnobstructedSq < 0) mapUnobstructedSq = 0
    }
    const mapArea = stage ? stage.width * stage.height : 0

    // Occlusion of the map by the planner, as a share of the map stage.
    const deckOverMapSq = stage && deck ? overlap(stage, deck) : 0

    return {
      viewport,
      horizontalOverflow: {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        overflows: doc.scrollWidth > doc.clientWidth,
        overflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth)
      },
      documentScrollHeight: doc.scrollHeight,
      boxes,
      collisions,
      mapVisibleAreaSq: mapArea,
      mapVisibleShare: viewport.width * viewport.height > 0
        ? mapArea / (viewport.width * viewport.height)
        : 0,
      mapUnobstructedSq,
      mapUnobstructedShare: viewport.width * viewport.height > 0
        ? mapUnobstructedSq / (viewport.width * viewport.height)
        : 0,
      plannerOverMapShare: mapArea > 0 ? deckOverMapSq / mapArea : 0
    }
  }, SELECTORS)
}

async function driveToState(page: Page, state: BaselineState): Promise<void> {
  switch (state) {
    case "search":
      await uxState.home(page)
      return
    case "choose":
      await uxState.routeAlternatives(page)
      return
    case "edit":
      await uxState.routeEdit(page)
      return
    case "prepare":
      await uxState.routeSelected(page)
      return
    default:
      return
  }
}

test.describe("adaptive workspace baseline (Train B / B1)", () => {
  for (const viewport of VIEWPORTS) {
    for (const state of STATES) {
      test(`${viewport.label} ${state}`, async ({ page }, testInfo) => {
        test.skip(
          testInfo.project.name !== "desktop-chromium",
          "Baseline harness runs in a single project; it sets its own viewport per case."
        )
        test.setTimeout(150_000)

        await page.setViewportSize({ width: viewport.width, height: viewport.height })

        const record: Record<string, unknown> = {
          viewport: viewport.label,
          width: viewport.width,
          height: viewport.height,
          state,
          capturedAt: new Date().toISOString()
        }

        try {
          await driveToState(page, state)
          // Documented map camera settle delay from the shared fixtures, so a
          // capture never straddles an in-flight transition.
          await page.waitForTimeout(900)
          record.measurement = await measure(page)
          const shot = path.join(EVIDENCE_DIR, `${viewport.label}-${state}.png`)
          await page.screenshot({ path: shot, fullPage: false })
          record.screenshot = path.relative(process.cwd(), shot)
          recordCapture(record)
        } catch (caught) {
          // An unreachable state at a viewport is itself a finding, not a crash.
          record.error = caught instanceof Error ? caught.message : String(caught)
          recordCapture(record, `${viewport.label}/${state}: ${record.error}`)
          // Surface it so the run's summary shows which captures are missing,
          // but leave the evidence recorded above intact.
          expect(
            record.error,
            `${viewport.label}/${state} could not be captured`
          ).toBeUndefined()
        }
      })
    }
  }
})
