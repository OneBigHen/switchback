import { expect, test } from "@playwright/test"
import { uxState } from "./helpers/ux-state-fixtures"
import { openRecordPanel, startRecording } from "./mobile-qa/ride-mobile-states"

test.describe("short landscape planner composition", () => {
  test.use({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps the idle sheet and map controls inside the visual viewport", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
    await expect(page.locator(".map-layer-control")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-right")).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-left")).toHaveCount(1, { timeout: 15_000 })

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      }

      return {
        viewport: { width: innerWidth, height: innerHeight },
        deck: box(".planner-deck.is-idle-plan"),
        layerControl: box(".map-layer-control"),
        // The MapLibre/Mapbox corner nodes are layout wrappers whose boxes
        // span every child in that corner. Compare the actual interactive
        // attribution and navigation groups, not their containing stack;
        // otherwise two vertically separated controls report a false overlap.
        attribution: box(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib, .mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-attrib"),
        navigationControls: box(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group"),
      }
    })

    expect(geometry.deck).not.toBeNull()
    expect(geometry.layerControl).not.toBeNull()
    expect(geometry.attribution).not.toBeNull()
    expect(geometry.navigationControls).not.toBeNull()

    const viewport = geometry.viewport
    for (const [name, rect] of Object.entries({
      deck: geometry.deck,
      layerControl: geometry.layerControl,
      attribution: geometry.attribution,
      navigationControls: geometry.navigationControls,
    })) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(viewport.height)
    }

    expect(geometry.deck!.left).toBeGreaterThanOrEqual(80)
    expect(geometry.layerControl!.left).toBeGreaterThanOrEqual(geometry.deck!.right)
    expect(geometry.navigationControls!.left).toBeGreaterThanOrEqual(geometry.deck!.right)
  })

  test("keeps active Ride surfaces separated in the same constrained viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-landscape-narrow", "the constrained side-deck contract runs in its named project")
    await uxState.ride(page)

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        instruction: box(".ride-hud:not(.free-ride-hud) .ride-instruction"),
        telemetry: box(".ride-hud:not(.free-ride-hud) .ride-telemetry"),
      }
    })

    expect(geometry.instruction).not.toBeNull()
    expect(geometry.telemetry).not.toBeNull()
    expect(geometry.instruction!.left).toBeGreaterThanOrEqual(0)
    expect(geometry.instruction!.top).toBeGreaterThanOrEqual(0)
    expect(geometry.instruction!.bottom).toBeLessThanOrEqual(geometry.viewport.height)
    expect(geometry.telemetry!.left).toBeGreaterThanOrEqual(0)
    expect(geometry.telemetry!.top).toBeGreaterThanOrEqual(0)
    expect(geometry.telemetry!.bottom).toBeLessThanOrEqual(geometry.viewport.height)
    expect(geometry.instruction!.right).toBeLessThanOrEqual(geometry.telemetry!.left)
  })
})

test.describe("portrait Ride composition", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  })

  test("keeps the guidance card above telemetry with a readable gutter", async ({ page }) => {
    await uxState.ride(page)

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        topbar: box(".ride-hud:not(.free-ride-hud) .ride-topbar"),
        instruction: box(".ride-hud:not(.free-ride-hud) .ride-instruction"),
        telemetry: box(".ride-hud:not(.free-ride-hud) .ride-telemetry"),
      }
    })

    expect(geometry.topbar).not.toBeNull()
    expect(geometry.instruction).not.toBeNull()
    expect(geometry.telemetry).not.toBeNull()
    for (const [name, rect] of Object.entries({
      topbar: geometry.topbar,
      instruction: geometry.instruction,
      telemetry: geometry.telemetry,
    })) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(geometry.viewport.height)
    }
    expect(geometry.instruction!.bottom + 8).toBeLessThanOrEqual(geometry.telemetry!.top)
  })
})

test.describe("short landscape Advisor composition", () => {
  test.use({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps the open Advisor panel and recovery controls inside its narrow deck", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()

    const invite = page.getByRole("button", { name: /Gravel Goblin.*Need a ride idea/i })
    await invite.scrollIntoViewIfNeeded()
    await invite.click()

    const panel = page.getByRole("region", { name: "Gravel Goblin" })
    await expect(panel).toBeVisible()
    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()

    for (const [name, locator] of [
      ["close", panel.getByRole("button", { name: "Close Gravel Goblin" })],
      ["question", panel.getByRole("textbox", { name: "Ask Gravel Goblin" })],
      ["send", panel.getByRole("button", { name: "Send to Gravel Goblin" })],
    ] as const) {
      const box = await locator.boundingBox()
      expect(box, `${name} should have geometry`).not.toBeNull()
      expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(panelBox!.x)
      expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(panelBox!.x + panelBox!.width)
    }
  })
})

test.describe("portrait Draw composition", () => {
  test.use({
    viewport: { width: 430, height: 932 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps sketch instructions, map controls, credits, and actions independently reachable", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
    await expect(page.locator(".map-layer-control")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group").first()).toBeVisible({ timeout: 15_000 })
    await page.locator(".plan-v2__draw-action").click()
    await expect(page.getByRole("region", { name: "Draw a rough route" })).toBeVisible()

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const rects = Array.from(document.querySelectorAll<HTMLElement>(selector))
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
        if (rects.length === 0) return null
        return {
          left: Math.min(...rects.map((rect) => rect.left)),
          top: Math.min(...rects.map((rect) => rect.top)),
          right: Math.max(...rects.map((rect) => rect.right)),
          bottom: Math.max(...rects.map((rect) => rect.bottom))
        }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        instructions: box(".map-sketch-instructions"),
        toolbar: box(".map-sketch-toolbar"),
        layerControl: box(".map-layer-control"),
        attribution: box(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib, .mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-attrib"),
        navigationControls: box(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group"),
      }
    })

    const required = {
      instructions: geometry.instructions,
      toolbar: geometry.toolbar,
      layerControl: geometry.layerControl,
      attribution: geometry.attribution,
      navigationControls: geometry.navigationControls,
    }
    for (const [name, rect] of Object.entries(required)) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(geometry.viewport.height)
    }

    const overlaps = (first: NonNullable<typeof geometry.instructions>, second: NonNullable<typeof geometry.instructions>) =>
      first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    expect(overlaps(geometry.instructions!, geometry.layerControl!), "layers must not cover sketch instructions").toBe(false)
    expect(overlaps(geometry.toolbar!, geometry.navigationControls!), "navigation controls must not cover sketch actions").toBe(false)
    expect(overlaps(geometry.toolbar!, geometry.attribution!), "map credits must not sit under sketch actions").toBe(false)
  })
})

test.describe("short landscape Draw composition", () => {
  test.use({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps the compact sketch lanes separate and native map controls usable", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("form", { name: "Ride request" })).toBeVisible()
    await expect(page.locator(".map-layer-control")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group").first()).toBeVisible({ timeout: 15_000 })
    await page.locator(".plan-v2__draw-action").click()
    await expect(page.getByRole("region", { name: "Draw a rough route" })).toBeVisible()

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const rects = Array.from(document.querySelectorAll<HTMLElement>(selector))
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
        if (rects.length === 0) return null
        return {
          left: Math.min(...rects.map((rect) => rect.left)),
          top: Math.min(...rects.map((rect) => rect.top)),
          right: Math.max(...rects.map((rect) => rect.right)),
          bottom: Math.max(...rects.map((rect) => rect.bottom))
        }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        instructions: box(".map-sketch-instructions"),
        toolbar: box(".map-sketch-toolbar"),
        layerControl: box(".map-layer-control"),
        attribution: box(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib, .mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-attrib"),
        navigationControls: box(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group, .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group"),
      }
    })

    const entries = Object.entries({
      instructions: geometry.instructions,
      toolbar: geometry.toolbar,
      layerControl: geometry.layerControl,
      attribution: geometry.attribution,
      navigationControls: geometry.navigationControls,
    })
    for (const [name, rect] of entries) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(geometry.viewport.height)
    }

    const overlaps = (first: NonNullable<typeof geometry.instructions>, second: NonNullable<typeof geometry.instructions>) =>
      first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    for (let index = 0; index < entries.length; index += 1) {
      for (let next = index + 1; next < entries.length; next += 1) {
        expect(
          overlaps(entries[index]![1]!, entries[next]![1]!),
          `${entries[index]![0]} must not cover ${entries[next]![0]}`
        ).toBe(false)
      }
    }

    await page.getByRole("button", { name: "Zoom in" }).click()
  })
})

test.describe("recording HUD composition", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps recording telemetry and controls readable and independently reachable", async ({ page }) => {
    await openRecordPanel(page)
    await startRecording(page)

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        header: box(".recording-ride-hud > header"),
        main: box(".recording-ride-hud .recording-main"),
        telemetry: box(".recording-ride-hud .ride-telemetry"),
        controls: box(".recording-ride-hud .recording-controls"),
        buttons: Array.from(document.querySelectorAll<HTMLElement>(".recording-ride-hud .recording-controls button")).map((button) => {
          const rect = button.getBoundingClientRect()
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        }),
      }
    })

    const surfaces = {
      header: geometry.header,
      main: geometry.main,
      telemetry: geometry.telemetry,
      controls: geometry.controls,
    }
    for (const [name, rect] of Object.entries(surfaces)) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(geometry.viewport.height)
    }
    expect(geometry.telemetry!.bottom).toBeLessThanOrEqual(geometry.controls!.top)
    for (const [index, button] of geometry.buttons.entries()) {
      expect(button.width, `button ${index} width`).toBeGreaterThanOrEqual(44)
      expect(button.height, `button ${index} height`).toBeGreaterThanOrEqual(44)
      expect(button.left, `button ${index} left`).toBeGreaterThanOrEqual(geometry.controls!.left)
      expect(button.right, `button ${index} right`).toBeLessThanOrEqual(geometry.controls!.right)
    }
  })
})

test.describe("short landscape recording HUD composition", () => {
  test.use({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
  })

  test("keeps recording surfaces and controls inside the constrained viewport", async ({ page }) => {
    await openRecordPanel(page)
    await startRecording(page)

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        header: box(".recording-ride-hud > header"),
        main: box(".recording-ride-hud .recording-main"),
        telemetry: box(".recording-ride-hud .ride-telemetry"),
        controls: box(".recording-ride-hud .recording-controls"),
        buttons: Array.from(document.querySelectorAll<HTMLElement>(".recording-ride-hud .recording-controls button")).map((button) => {
          const rect = button.getBoundingClientRect()
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        }),
      }
    })

    for (const [name, rect] of Object.entries({
      header: geometry.header,
      main: geometry.main,
      telemetry: geometry.telemetry,
      controls: geometry.controls,
    })) {
      expect(rect, `${name} should have geometry`).not.toBeNull()
      expect(rect!.left, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect!.top, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect!.right, `${name} right`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(rect!.bottom, `${name} bottom`).toBeLessThanOrEqual(geometry.viewport.height)
    }

    expect(geometry.telemetry!.bottom).toBeLessThanOrEqual(geometry.controls!.top)
    for (const [index, button] of geometry.buttons.entries()) {
      expect(button.width, `button ${index} width`).toBeGreaterThanOrEqual(44)
      expect(button.height, `button ${index} height`).toBeGreaterThanOrEqual(44)
      expect(button.left, `button ${index} left`).toBeGreaterThanOrEqual(geometry.controls!.left)
      expect(button.right, `button ${index} right`).toBeLessThanOrEqual(geometry.controls!.right)
    }
  })
})
