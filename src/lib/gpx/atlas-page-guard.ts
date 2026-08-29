import { headers } from "next/headers"
import { createRateLimiter } from "@/lib/server/rate-limiter"

/**
 * Request cap for the public Atlas pages.
 *
 * Those pages stay `force-dynamic` on purpose — prerendering them would bake
 * whatever generated data happened to exist on the build machine into the
 * deploy — so every view renders the collection fresh. The sibling catalog API
 * is already capped at 60/min "to keep scraping cheap"; without the same cap
 * on the pages, enumerating the public route ids is an easy way to keep a
 * single-instance origin busy. The budget is well above what a rider browsing
 * the atlas will ever spend.
 */
const atlasPageLimiter = createRateLimiter({ windowMs: 60_000, max: 60, label: "atlas page request" })

/** True when this caller has spent its atlas-page budget for the window. */
export async function isAtlasPageOverBudget(): Promise<boolean> {
  const requestHeaders = await headers()
  return atlasPageLimiter.check(new Request("http://atlas.local/", { headers: requestHeaders })) !== null
}
