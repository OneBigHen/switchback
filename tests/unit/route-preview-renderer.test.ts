import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { collectionBoundingBox, buildRoutePreviewSpec, type GeoBoundingBox } from "@/lib/routes/route-preview"

const maplibre = vi.hoisted(() => {
  const behaviour = { loads: [] as Array<"load" | "never">, created: 0, removed: 0 }
  class FakeMap {
    private handlers = new Map<string, Array<() => void>>()
    constructor() {
      const mode = behaviour.loads[behaviour.created] ?? "load"
      behaviour.created += 1
      // Tile errors arrive before load and must not be fatal.
      queueMicrotask(() => this.emit("error"))
      if (mode === "load") queueMicrotask(() => this.emit("load"))
    }
    private emit(event: string) {
      const list = this.handlers.get(event) ?? []
      this.handlers.set(event, [])
      for (const handler of list) handler()
    }
    once(event: string, handler: () => void) { this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]) }
    on(event: string, handler: () => void) {
      this.once(event, handler)
      if (event === "idle") queueMicrotask(() => this.emit("idle"))
    }
    off() {}
    remove() { behaviour.removed += 1 }
    resize() {}
    fitBounds() {}
    getSource() { return { setData() {} } }
    addSource() {}
    addLayer() {}
    getLayer() { return undefined }
    loaded() { return true }
    triggerRepaint() {}
    getCanvas() { return { toDataURL: () => "data:image/webp;base64,preview" } }
  }
  return { behaviour, module: { Map: FakeMap, setWorkerUrl: () => undefined } }
})

vi.mock("maplibre-gl", () => maplibre.module)

const bbox: GeoBoundingBox = [-77.9, 40.7, -77.4, 41.1]
function request(routeId: string) {
  return {
    spec: buildRoutePreviewSpec({ routeId, bbox, size: "small", styleId: "explorer", geometryFingerprint: routeId }),
    geometry: [[-77.9, 40.7], [-77.4, 41.1]] as Array<[number, number]>,
    start: null,
    end: null
  }
}

async function renderer() {
  const previews = await import("@/components/route-library/route-preview-renderer")
  previews.resetRoutePreviewRenderer()
  return previews
}

beforeEach(() => {
  maplibre.behaviour.loads = []
  maplibre.behaviour.created = 0
  maplibre.behaviour.removed = 0
})
afterEach(() => vi.useRealTimers())

describe("shared route preview renderer", () => {
  it("renders through tile errors that arrive before the style loads", async () => {
    const { requestRoutePreview, routePreviewRendererState } = await renderer()
    await expect(requestRoutePreview(request("a"))).resolves.toBe("data:image/webp;base64,preview")
    expect(routePreviewRendererState()).toBe("ready")
  })

  it("tries the style again after a slow load instead of switching previews off for the session", async () => {
    vi.useFakeTimers()
    maplibre.behaviour.loads = ["never", "load"]
    const { requestRoutePreview, routePreviewRendererState } = await renderer()

    const pending = requestRoutePreview(request("b"))
    await vi.advanceTimersByTimeAsync(20_000)

    await expect(pending).resolves.toBe("data:image/webp;base64,preview")
    expect(maplibre.behaviour.created).toBe(2)
    expect(maplibre.behaviour.removed).toBe(1)
    expect(routePreviewRendererState()).toBe("ready")
  })

  it("drops a queued render once every card waiting for it has gone", async () => {
    const { requestRoutePreview } = await renderer()
    const first = requestRoutePreview(request("c"))
    const controller = new AbortController()
    const abandoned = requestRoutePreview(request("d"), controller.signal)
    controller.abort()

    await expect(abandoned).resolves.toBeNull()
    await expect(first).resolves.toBe("data:image/webp;base64,preview")
  })
})

describe("collection framing", () => {
  it("ignores a stray route on another continent", () => {
    const pennsylvania: GeoBoundingBox[] = [[-78, 40, -77, 41], [-76, 39.8, -75, 40.6], [-80, 39.7, -79, 40.5]]
    const brussels: GeoBoundingBox = [4.40497, 50.77613, 4.41838, 50.79087]
    expect(collectionBoundingBox([...pennsylvania, brussels])).toEqual([-80, 39.7, -75, 41])
    expect(collectionBoundingBox([])).toBeNull()
  })
})
