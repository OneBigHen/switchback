import { loadBrowseCatalog } from "@/app/gpx-library/load-catalog"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Same shape of payload the Route Library page already renders; keep scraping
// as cheap as the page it mirrors.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 60, label: "route catalog request" })

/**
 * Browse rows for the in-app Explore destination.
 *
 * Explore and `/gpx-library` are two entry points to one catalog, so this
 * serves exactly what the page renders — summary rows plus the precomputed
 * poster art the client recovers real geography from. No per-route geometry:
 * the full line is still only served by `/api/gpx-library?id=`.
 */
async function handleRouteCatalogGet(): Promise<Response> {
  const catalog = await loadBrowseCatalog()
  return Response.json(catalog, {
    headers: { "cache-control": "private, max-age=60" }
  })
}

export const GET = withRateLimit(requestLimiter, handleRouteCatalogGet)
