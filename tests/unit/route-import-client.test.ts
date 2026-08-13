import { describe, expect, it, vi } from "vitest"
import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import { parseImportWorkerResult } from "@/lib/routing/import-worker-protocol"
import type { PlannedRoute } from "@/lib/routing/types"

const route = {
  id: "worker-route",
  name: "Worker route",
  profile: "scenic",
  geometry: [[-76.9, 40.1], [-76.8, 40.2]],
  waypoints: [
    { lat: 40.1, lon: -76.9, label: "Track start" },
    { lat: 40.2, lon: -76.8, label: "Track finish" }
  ],
  instructions: [],
  distanceMiles: 1,
  durationMinutes: 1,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 0,
  turnCount: 0,
  roadMix: {},
  surfaceMix: {},
  routingSource: "imported",
  previewOnly: false
} as PlannedRoute

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

function file(name = "ride.gpx") {
  return new File(["<gpx version=\"1.1\" />"], name, { type: "application/gpx+xml" })
}

describe("route import worker client", () => {
  it("transfers a bounded file to a worker and resolves its normalized route", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [request, transfer] = worker.postMessage.mock.calls[0]!
    expect(request).toMatchObject({ version: 1, kind: "parse-route", fileName: "ride.gpx" })
    expect(request.generation).toEqual(expect.any(Number))
    expect(transfer).toHaveLength(1)

    worker.onmessage?.({ data: {
      version: 1,
      kind: "parsed-route",
      requestId: request.requestId,
      generation: request.generation,
      route
    } } as MessageEvent)

    await expect(pending).resolves.toBe(route)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
  })

  it("rejects a worker parser error without leaving the worker alive", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [request] = worker.postMessage.mock.calls[0]!
    worker.onmessage?.({ data: {
      version: 1,
      kind: "import-error",
      requestId: request.requestId,
      generation: request.generation,
      message: "Malformed GPX"
    } } as MessageEvent)

    await expect(pending).rejects.toThrow("Malformed GPX")
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
  })

  it("rejects with an actionable message when the worker reports a runtime error and terminates the worker", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    worker.onerror?.({} as ErrorEvent)

    await expect(pending).rejects.toThrow("The route import worker stopped unexpectedly.")
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
  })

  it("aborts the request and ignores a stale or late worker response", async () => {
    const worker = new FakeWorker()
    const controller = new AbortController()
    const pending = parseRouteFileInWorker(file(), () => worker, controller.signal)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [request] = worker.postMessage.mock.calls[0]!
    const onmessage = worker.onmessage

    onmessage?.({ data: {
      version: 1,
      kind: "parsed-route",
      requestId: request.requestId,
      generation: request.generation + 1,
      route
    } } as MessageEvent)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
      version: 1,
      kind: "cancel",
      requestId: request.requestId,
      generation: request.generation,
      cancelRequestId: request.requestId
    }, [])
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()

    onmessage?.({ data: {
      version: 1,
      kind: "parsed-route",
      requestId: request.requestId,
      generation: request.generation,
      route
    } } as MessageEvent)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("rejects a malformed response for the active request and cleans up", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [request] = worker.postMessage.mock.calls[0]!
    worker.onmessage?.({ data: {
      version: 1,
      kind: "parsed-route",
      requestId: request.requestId,
      generation: request.generation,
      route: { id: "bad-route", geometry: [] }
    } } as MessageEvent)

    await expect(pending).rejects.toThrow("returned an invalid response")
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
  })

  it("rejects an oversized file before the worker factory is called", async () => {
    const createWorker = vi.fn(() => {
      throw new Error("worker factory should not be called")
    })
    const oversized = new File(
      [new Uint8Array(MAX_GPX_IMPORT_BYTES + 1)],
      "huge.gpx",
      { type: "application/gpx+xml" }
    )

    await expect(parseRouteFileInWorker(oversized, createWorker))
      .rejects.toThrow("Route imports must be 5 MB or smaller.")
    expect(createWorker).not.toHaveBeenCalled()
  })

  it("validates optional intrinsic feature provenance on worker responses", () => {
    const base = {
      version: 1 as const,
      kind: "parsed-route" as const,
      requestId: "request-1",
      generation: 1,
      route
    }
    expect(parseImportWorkerResult({
      ...base,
      route: {
        ...route,
        featureProvenance: {
          mvum: { source: "unavailable", coverage: "unknown", limitations: ["Not installed"] }
        }
      }
    })).not.toBeNull()
    expect(parseImportWorkerResult({
      ...base,
      route: { ...route, featureProvenance: { madeUp: { source: "fake" } } }
    })).toBeNull()
  })
})
