import { createHash } from "node:crypto"

import {
  OfflineRegionFileError,
  readActiveManifest
} from "@/lib/server/offline-region-files"
import { createRateLimiter } from "@/lib/server/rate-limiter"

interface RouteContext {
  params: Promise<{ regionId: string }>
}

// Region manifests list every tile file; keep anonymous scraping cheap.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 120, label: "offline manifest request" })

function failure(error: unknown): Response {
  const status = error instanceof OfflineRegionFileError ? error.status : 500
  const message = error instanceof OfflineRegionFileError ? error.message : "Offline manifest unavailable"
  return Response.json({ error: message }, { status })
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const blocked = requestLimiter.check(request)
  if (blocked) return blocked
  try {
    const { regionId } = await context.params
    const manifest = await readActiveManifest(regionId)
    const body = JSON.stringify(manifest)
    const etag = `"sha256-${createHash("sha256").update(body).digest("hex")}"`
    return new Response(body, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag
      }
    })
  } catch (error) {
    return failure(error)
  }
}
