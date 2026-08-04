import { describe, expect, it, vi } from "vitest"
import { createRateLimiter, requestClientKey, withRateLimit } from "@/lib/server/rate-limiter"

function requestWithIp(ip: string, url = "http://switchback.test/"): Request {
  return new Request(url, { headers: { "x-real-ip": ip } })
}

describe("requestClientKey", () => {
  it("prefers x-real-ip, then x-forwarded-for, then anonymous", () => {
    expect(requestClientKey(new Request("http://t/", { headers: { "x-real-ip": "4.4.4.4" } }))).toBe("4.4.4.4")
    expect(requestClientKey(new Request("http://t/", { headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" } }))).toBe("2.2.2.2")
    expect(requestClientKey(new Request("http://t/"))).toBe("anonymous")
  })

  it("ignores client-supplied cf-connecting-ip unless explicitly trusted", () => {
    // Without TRUST_CF_CONNECTING_IP the header is not a rate-limit key,
    // so a direct attacker cannot rotate windows by spoofing it.
    expect(requestClientKey(new Request("http://t/", { headers: { "cf-connecting-ip": "1.1.1.1" } }))).toBe("anonymous")
  })

  it("uses cf-connecting-ip when TRUST_CF_CONNECTING_IP=1", () => {
    process.env.TRUST_CF_CONNECTING_IP = "1"
    try {
      expect(requestClientKey(new Request("http://t/", { headers: { "cf-connecting-ip": "1.1.1.1" } }))).toBe("1.1.1.1")
    } finally {
      delete process.env.TRUST_CF_CONNECTING_IP
    }
  })

  it("rejects garbage IP values instead of using them as keys", () => {
    expect(requestClientKey(new Request("http://t/", { headers: { "x-real-ip": "evil.example" } }))).toBe("anonymous")
    expect(requestClientKey(new Request("http://t/", { headers: { "x-forwarded-for": "not-an-ip" } }))).toBe("anonymous")
  })
})

describe("createRateLimiter", () => {
  it("allows up to max requests per window then blocks with 429", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, label: "test request" })
    expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
    expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
    expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
    const blocked = limiter.check(requestWithIp("10.0.0.1"))
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get("retry-after")).toBe("60")
  })

  it("keeps separate windows per client", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
    expect(limiter.check(requestWithIp("10.0.0.2"))).toBeNull()
    expect(limiter.check(requestWithIp("10.0.0.1"))).not.toBeNull()
    expect(limiter.check(requestWithIp("10.0.0.2"))).not.toBeNull()
  })

  it("lets the window slide so old hits expire", () => {
    vi.useFakeTimers()
    try {
      const limiter = createRateLimiter({ windowMs: 1_000, max: 1 })
      expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
      expect(limiter.check(requestWithIp("10.0.0.1"))).not.toBeNull()
      vi.advanceTimersByTime(1_100)
      expect(limiter.check(requestWithIp("10.0.0.1"))).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("exposes observable hit counts for a key", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 })
    limiter.check(requestWithIp("10.0.0.1"))
    limiter.check(requestWithIp("10.0.0.1"))
    expect(limiter.hits("10.0.0.1")).toBe(2)
  })
})

describe("withRateLimit", () => {
  it("passes through within the window and blocks afterwards", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, label: "route request" })
    const handler = vi.fn(async () => new Response("ok", { status: 200 }))
    const wrapped = withRateLimit(limiter, handler)

    const first = await wrapped(requestWithIp("10.0.0.9"))
    expect(first.status).toBe(200)
    const second = await wrapped(requestWithIp("10.0.0.9"))
    expect(second.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(2)

    const third = await wrapped(requestWithIp("10.0.0.9"))
    expect(third.status).toBe(429)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
