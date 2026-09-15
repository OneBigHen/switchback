import { describe, expect, it } from "vitest"
import {
  isSensitiveTelemetryKey,
  sanitizeCapturedNetworkRequest,
  sanitizeCaptureResult,
  sanitizeTelemetryProperties,
  sanitizeTelemetryUrl
} from "@/lib/telemetry/privacy"

describe("telemetry privacy boundary", () => {
  it("removes prohibited keys and raw ride payloads recursively", () => {
    const safe = sanitizeTelemetryProperties({
      route_mode: "best-ride",
      distance_band: "25-50mi",
      password: ["fixture", "only"].join("-"),
      nested: {
        api_key: "do-not-send",
        coordinates: [[-75.1, 40.1]],
        status: "failed"
      },
      route: [[-75.1, 40.1], [-75.2, 40.2]],
      route_points: [[-75.3, 40.3], [-75.4, 40.4]],
      point: { x: -75.5, y: 40.5 },
      raw_gpx: "<gpx><trk>private ride</trk></gpx>"
    })

    expect(safe).toEqual({
      route_mode: "best-ride",
      distance_band: "25-50mi",
      nested: { status: "failed" }
    })
  })

  it("sanitizes private URL material into route templates", () => {
    expect(sanitizeTelemetryUrl("https://ride.example.test/shared/s3cr3t?lat=40.1&lng=-75.2#token")).toBe(
      "https://ride.example.test/shared/[token]"
    )
    expect(sanitizeTelemetryUrl("/routes/route-123?query=home")).toBe("/routes/[id]")
    expect(sanitizeTelemetryUrl("/api/community/routes/opaque-id/comments")).toBe("/api/community/routes/[id]/comments")
    expect(sanitizeTelemetryUrl("/planner?origin=40.1,-75.2")).toBe("/planner")
  })

  it("scrubs event payloads without dropping safe release context", () => {
    const safe = sanitizeCaptureResult({
      uuid: "event-id",
      event: "route_plan_succeeded",
      properties: {
        build_sha: "abc123",
        deployment_id: "deploy-1",
        destination_lat: 40.1,
        route_mode: "best-ride"
      }
    })

    expect(safe?.properties).toEqual({
      build_sha: "abc123",
      deployment_id: "deploy-1",
      route_mode: "best-ride"
    })
  })

  it("keeps exception type metadata while removing messages, stacks, and dynamic paths", () => {
    const safe = sanitizeCaptureResult({
      uuid: "event-id",
      event: "$exception",
      properties: {
        "$exception_list": [{
          type: "TypeError",
          value: "Authorization: Bearer private-secret",
          stacktrace: { frames: [{ filename: "/shared/private-token", context_line: "password=private" }] }
        }],
        "$exception_type": "TypeError",
        "$exception_message": "password=private",
        "$exception_steps": [{ message: "private note" }],
        "$exception_level": "error",
        "$exception_handled": false,
        "$exception_fingerprint": "abc123",
        pathname: "/shared/private-token?token=secret"
      }
    })

    expect(safe?.properties).toEqual({
      "$exception_list": [{ type: "TypeError" }],
      "$exception_type": "TypeError",
      "$exception_level": "error",
      "$exception_handled": false,
      "$exception_fingerprint": "abc123",
      pathname: "/shared/[token]"
    })
    expect(JSON.stringify(safe)).not.toContain("private-secret")
    expect(JSON.stringify(safe)).not.toContain("private-token")
    expect(JSON.stringify(safe)).not.toContain("password=private")
  })

  it("normalizes replay network metadata and removes bodies and headers", () => {
    const safe = sanitizeCapturedNetworkRequest({
      name: "https://router.example.test/api/route?points=40.1,-75.2&token=secret",
      entryType: "resource",
      startTime: 10,
      duration: 125,
      requestHeaders: { authorization: "Bearer secret" },
      responseHeaders: { "set-cookie": "private" },
      requestBody: '{"coordinates":[-75.2,40.1]}',
      responseBody: '{"geometry":[]}'
    })

    expect(safe?.name).toBe("https://router.example.test/api/route")
    expect(safe).not.toHaveProperty("requestHeaders")
    expect(safe).not.toHaveProperty("responseHeaders")
    expect(safe).not.toHaveProperty("requestBody")
    expect(safe).not.toHaveProperty("responseBody")
  })

  it("recognizes sensitive keys case-insensitively", () => {
    expect(isSensitiveTelemetryKey("WebAuthnChallenge")).toBe(true)
    expect(isSensitiveTelemetryKey("latency_ms")).toBe(false)
    expect(isSensitiveTelemetryKey("route_mode")).toBe(false)
  })
})
