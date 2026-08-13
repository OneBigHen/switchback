/**
 * In-memory sliding-window rate limiter for the public API surface.
 *
 * Keyed by the caller's IP (Cloudflare's `cf-connecting-ip` first, then
 * `x-forwarded-for` / `x-real-ip`, falling back to `anonymous`). Each window
 * is a list of timestamps pruned on access; the map is pruned when it grows
 * past a sane bound so a long-lived public instance never leaks memory.
 *
 * Single-process only — fine for the self-hosted Next origin behind one
 * reverse proxy. If Switchback is ever scaled horizontally, swap this for a
 * shared store (Redis/Cloudflare rate limiting).
 */

import { readRequestId, withRequestId } from "@/lib/server/api-contract"

export interface RateLimiter {
  /** Returns a 429 Response when the caller exceeded the window, else null. */
  check(request: Request): Response | null
  /** Observable current hit count for a key (tests/observability). */
  hits(key: string): number
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Max requests per key per window. */
  max: number
  /** Noun used in the 429 message, e.g. "route request". */
  label?: string
}

const MAX_TRACKED_KEYS = 10_000

/**
 * Loose sanity check for client-IP values. This is NOT the security control —
 * the real boundary is the reverse proxy stripping and rewriting these
 * headers from the socket peer (see infra/caddy/Caddyfile.example). The regex
 * only prevents garbage values from becoming distinct rate-limit keys.
 */
const IP_LIKE = /^[\d.a-fA-F:\[\]%]+$/

export function requestClientKey(request: Request): string {
  // Behind a real Cloudflare edge, cf-connecting-ip is the actual visitor IP.
  // It is only trustworthy when the origin is firewalled to Cloudflare's
  // ranges (an attacker hitting the origin directly could spoof it), so it is
  // opt-in via TRUST_CF_CONNECTING_IP=1. Everywhere else the reverse proxy
  // owns the client-IP headers: Caddy strips client-supplied copies and sets
  // X-Real-IP / X-Forwarded-For from the real TCP peer.
  if (process.env.TRUST_CF_CONNECTING_IP === "1") {
    const cf = request.headers.get("cf-connecting-ip")?.trim()
    if (cf && IP_LIKE.test(cf)) return cf
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp && IP_LIKE.test(realIp)) return realIp
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
  if (forwarded && IP_LIKE.test(forwarded)) return forwarded
  return "anonymous"
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max } = options
  const label = options.label ?? "request"
  const hitsByKey = new Map<string, number[]>()

  function prune(now: number): void {
    if (hitsByKey.size <= MAX_TRACKED_KEYS) return
    const cutoff = now - windowMs
    for (const [key, hits] of hitsByKey) {
      const remaining = hits.filter((timestamp) => timestamp > cutoff)
      if (remaining.length === 0) hitsByKey.delete(key)
      else hitsByKey.set(key, remaining)
    }
  }

  return {
    check(request) {
      const key = requestClientKey(request)
      const now = Date.now()
      const cutoff = now - windowMs
      prune(now)
      const window = (hitsByKey.get(key) ?? []).filter((timestamp) => timestamp > cutoff)
      if (window.length >= max) {
        hitsByKey.set(key, window)
        return Response.json(
          { error: { code: "RATE_LIMITED", message: `Too many ${label}s. Try again in a moment.` } },
          { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil(windowMs / 1000))) } }
        )
      }
      window.push(now)
      hitsByKey.set(key, window)
      return null
    },
    hits(key) {
      const now = Date.now()
      const cutoff = now - windowMs
      return (hitsByKey.get(key) ?? []).filter((timestamp) => timestamp > cutoff).length
    }
  }
}

/** Wrap a route handler so every call is checked against the limiter first. */
export function withRateLimit(
  limiter: RateLimiter,
  handler: (request: Request) => Promise<Response> | Response
): (request: Request) => Promise<Response> {
  return async (request) => {
    const blocked = limiter.check(request)
    if (blocked) return withRequestId(blocked, readRequestId(request))
    return withRequestId(await handler(request), readRequestId(request))
  }
}
