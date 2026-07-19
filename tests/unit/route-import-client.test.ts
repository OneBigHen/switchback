import { describe, expect, it, vi } from "vitest"
import { parseRouteFileInWorker } from "@/lib/client/route-import-client"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import type { PlannedRoute } from "@/lib/routing/types"

const route = {
  id: "worker-route",
  name: "Worker route",
  geometry: [[-76.9, 40.1], [-76.8, 40.2]]
} as PlannedRoute

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
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
    expect(transfer).toHaveLength(1)

    worker.onmessage?.({ data: { version: 1, kind: "parsed-route", requestId: request.requestId, route } } as MessageEvent)

    await expect(pending).resolves.toBe(route)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("rejects a worker parser error without leaving the worker alive", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [request] = worker.postMessage.mock.calls[0]!
    worker.onmessage?.({ data: { version: 1, kind: "import-error", requestId: request.requestId, message: "Malformed GPX" } } as MessageEvent)

    await expect(pending).rejects.toThrow("Malformed GPX")
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it("rejects with an actionable message when the worker reports a runtime error and terminates the worker", async () => {
    const worker = new FakeWorker()
    const pending = parseRouteFileInWorker(file(), () => worker)

    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    worker.onerror?.({} as ErrorEvent)

    await expect(pending).rejects.toThrow("The route import worker stopped unexpectedly.")
    expect(worker.terminate).toHaveBeenCalledOnce()
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
})
