import { describe, expect, it } from "vitest"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"

describe("readBoundedJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const request = new Request("http://switchback.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" })
    })
    await expect(readBoundedJsonBody(request)).resolves.toEqual({ prompt: "hello" })
  })

  it("rejects a body whose content-length exceeds the cap", async () => {
    const request = new Request("http://switchback.test/", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999999" },
      body: JSON.stringify({ prompt: "x".repeat(100) })
    })
    await expect(readBoundedJsonBody(request, 64)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it("cancels mid-stream when the body exceeds the cap without a content-length", async () => {
    const payload = JSON.stringify({ prompt: "x".repeat(4_000) })
    const request = new Request("http://switchback.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload
    })
    await expect(readBoundedJsonBody(request, 1_024)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it("rejects invalid JSON", async () => {
    const request = new Request("http://switchback.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    })
    await expect(readBoundedJsonBody(request)).rejects.toThrow("not valid JSON")
  })
})
