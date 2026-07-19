import { describe, expect, it } from "vitest"
import {
  OFFLINE_ROUTING_STALE_REQUEST_SENTINEL,
  OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
  buildOfflineRoutingWorkerFailure,
  buildOfflineRoutingWorkerOk,
  parseOfflineRoutingWorkerRequest,
  type OfflineRoutingWorkerRouteRequest
} from "@/lib/offline/worker-protocol"

const validRouteRequest = {
  version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
  requestId: "req-1",
  kind: "route" as const,
  graph: { nodes: [] },
  adjacency: { edges: [] },
  startNodeIndex: 0,
  goalNodeIndex: 1,
  atEpochMillis: 1_700_000_000_000
}

describe("offline-routing worker protocol", () => {
  describe("parseOfflineRoutingWorkerRequest", () => {
    it("returns null for null/undefined/non-object inputs", () => {
      expect(parseOfflineRoutingWorkerRequest(null)).toBeNull()
      expect(parseOfflineRoutingWorkerRequest(undefined)).toBeNull()
      expect(parseOfflineRoutingWorkerRequest("not-an-object")).toBeNull()
      expect(parseOfflineRoutingWorkerRequest(42)).toBeNull()
      expect(parseOfflineRoutingWorkerRequest([])).toBeNull()
    })

    it("returns null when version is missing, non-number, or below 1", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, version: undefined })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, version: "1" })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, version: NaN })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, version: 0 })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, version: -1 })
      ).toBeNull()
    })

    it("accepts any version >= 1 for forward compatibility in the parser", () => {
      const future = parseOfflineRoutingWorkerRequest({
        ...validRouteRequest,
        version: 999
      })
      expect(future).not.toBeNull()
      expect(future?.version).toBe(999)
    })

    it("returns null when requestId is missing or not a non-empty string", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, requestId: undefined })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, requestId: "" })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, requestId: 42 })
      ).toBeNull()
    })

    it("returns null when kind is missing or not a supported value", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, kind: undefined })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, kind: "bogus" })
      ).toBeNull()
    })

    it("returns a typed route request for a well-formed payload", () => {
      const parsed = parseOfflineRoutingWorkerRequest(validRouteRequest)
      expect(parsed).not.toBeNull()
      expect(parsed?.kind).toBe("route")
      if (parsed?.kind === "route") {
        expect(parsed.requestId).toBe("req-1")
        expect(parsed.graph).toEqual({ nodes: [] })
        expect(parsed.adjacency).toEqual({ edges: [] })
        expect(parsed.startNodeIndex).toBe(0)
        expect(parsed.goalNodeIndex).toBe(1)
        expect(parsed.atEpochMillis).toBe(1_700_000_000_000)
      }
    })

    it("rejects route requests with NaN, negative, or non-integer node indices", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, startNodeIndex: NaN })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, startNodeIndex: -1 })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, startNodeIndex: 1.5 })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, startNodeIndex: "0" })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, goalNodeIndex: NaN })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, goalNodeIndex: -3 })
      ).toBeNull()
    })

    it("rejects route requests with missing or non-finite atEpochMillis", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, atEpochMillis: undefined })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, atEpochMillis: NaN })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, atEpochMillis: Infinity })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, atEpochMillis: "1000" })
      ).toBeNull()
    })

    it("rejects route requests with non-object graph/adjacency", () => {
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, graph: null })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, graph: "no" })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, adjacency: null })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({ ...validRouteRequest, adjacency: 42 })
      ).toBeNull()
    })

    it("returns a typed cancel request and requires a non-empty cancelRequestId", () => {
      const ok = parseOfflineRoutingWorkerRequest({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: "req-cancel",
        kind: "cancel",
        cancelRequestId: "req-1"
      })
      expect(ok).not.toBeNull()
      expect(ok?.kind).toBe("cancel")
      if (ok?.kind === "cancel") {
        expect(ok.cancelRequestId).toBe("req-1")
      }
      expect(
        parseOfflineRoutingWorkerRequest({
          version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
          requestId: "req-cancel",
          kind: "cancel",
          cancelRequestId: ""
        })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({
          version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
          requestId: "req-cancel",
          kind: "cancel",
          cancelRequestId: 42
        })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({
          version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
          requestId: "req-cancel",
          kind: "cancel"
        })
      ).toBeNull()
    })

    it("returns a typed ping request and requires an echo string", () => {
      const ok = parseOfflineRoutingWorkerRequest({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: "req-ping",
        kind: "ping",
        echo: "hello"
      })
      expect(ok).not.toBeNull()
      expect(ok?.kind).toBe("ping")
      if (ok?.kind === "ping") {
        expect(ok.echo).toBe("hello")
      }
      expect(
        parseOfflineRoutingWorkerRequest({
          version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
          requestId: "req-ping",
          kind: "ping",
          echo: 42
        })
      ).toBeNull()
      expect(
        parseOfflineRoutingWorkerRequest({
          version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
          requestId: "req-ping",
          kind: "ping"
        })
      ).toBeNull()
    })

    it("preserves optional maxVisitedNodes and respectOneWay when present", () => {
      const parsed = parseOfflineRoutingWorkerRequest({
        ...validRouteRequest,
        maxVisitedNodes: 1234,
        respectOneWay: false
      })
      expect(parsed).not.toBeNull()
      if (parsed?.kind === "route") {
        expect(parsed.maxVisitedNodes).toBe(1234)
        expect(parsed.respectOneWay).toBe(false)
      }
    })

    it("leaves optional fields undefined when absent", () => {
      const parsed = parseOfflineRoutingWorkerRequest(validRouteRequest)
      expect(parsed).not.toBeNull()
      if (parsed?.kind === "route") {
        expect(parsed.maxVisitedNodes).toBeUndefined()
        expect(parsed.respectOneWay).toBeUndefined()
      }
    })
  })

  describe("buildOfflineRoutingWorkerOk", () => {
    it("produces a normalized ok result with the expected fields", () => {
      const ok = buildOfflineRoutingWorkerOk(
        { requestId: "req-1", kind: "route" },
        { path: [0, 1, 2] }
      )
      expect(ok).toEqual({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: "req-1",
        status: "ok",
        result: { path: [0, 1, 2] },
        message: "",
        kind: "route",
        workerProtocolVersion: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION
      })
    })

    it("mirrors the request kind and uses the current protocol version", () => {
      const ok = buildOfflineRoutingWorkerOk(
        { requestId: "p", kind: "ping" },
        { echo: "hi" }
      )
      expect(ok.kind).toBe("ping")
      expect(ok.workerProtocolVersion).toBe(OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION)
      expect(ok.version).toBe(OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION)
    })
  })

  describe("buildOfflineRoutingWorkerFailure", () => {
    it("produces a failure with the expected status, message, and echoed ids", () => {
      const failure = buildOfflineRoutingWorkerFailure(
        { requestId: "req-2", kind: "route" },
        "no_path",
        "No path found."
      )
      expect(failure).toEqual({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: "req-2",
        status: "no_path",
        result: {},
        message: "No path found.",
        kind: "route",
        workerProtocolVersion: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION
      })
    })

    it("produces a stale failure with the sentinel shape so callers can detect superseded work", () => {
      const failure = buildOfflineRoutingWorkerFailure(
        { requestId: "req-stale", kind: "route" },
        "stale",
        "Request was superseded by a newer one."
      )
      expect(failure.status).toBe("stale")
      expect(failure.kind).toBe("route")
      expect(failure.requestId).toBe("req-stale")
      expect(failure.message).toBe("Request was superseded by a newer one.")
      expect(failure.workerProtocolVersion).toBe(OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION)
      expect(typeof OFFLINE_ROUTING_STALE_REQUEST_SENTINEL).toBe("symbol")
    })
  })

  describe("OFFLINE_ROUTING_STALE_REQUEST_SENTINEL", () => {
    it("is a unique symbol exported from the module", () => {
      expect(typeof OFFLINE_ROUTING_STALE_REQUEST_SENTINEL).toBe("symbol")
      // Re-exported via Symbol.for so callers across the worker boundary can
      // rely on a stable global registration.
      expect(OFFLINE_ROUTING_STALE_REQUEST_SENTINEL).toBe(
        Symbol.for("switchback.offline-routing.stale-request")
      )
    })
  })

  describe("round-trip", () => {
    it("round-trips a fully-populated route request through parse", () => {
      const original: OfflineRoutingWorkerRouteRequest = {
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: "round-trip",
        kind: "route",
        graph: { nodes: [{ id: 0 }, { id: 1 }] },
        adjacency: { edges: [[0, 1]] },
        startNodeIndex: 0,
        goalNodeIndex: 1,
        atEpochMillis: 1_700_000_000_000,
        maxVisitedNodes: 5000,
        respectOneWay: true
      }
      const parsed = parseOfflineRoutingWorkerRequest(original)
      expect(parsed).not.toBeNull()
      if (parsed?.kind === "route") {
        expect(parsed.version).toBe(original.version)
        expect(parsed.requestId).toBe(original.requestId)
        expect(parsed.kind).toBe(original.kind)
        expect(parsed.graph).toEqual(original.graph)
        expect(parsed.adjacency).toEqual(original.adjacency)
        expect(parsed.startNodeIndex).toBe(original.startNodeIndex)
        expect(parsed.goalNodeIndex).toBe(original.goalNodeIndex)
        expect(parsed.atEpochMillis).toBe(original.atEpochMillis)
        expect(parsed.maxVisitedNodes).toBe(original.maxVisitedNodes)
        expect(parsed.respectOneWay).toBe(original.respectOneWay)
      }
    })
  })
})
