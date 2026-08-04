import path from "node:path"
import { handleGpxCatalogRequest } from "./handler"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// The catalog serves the user's full route library; keep scraping cheap.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 60, label: "library request" })

async function handleGpxLibraryGet(request: Request): Promise<Response> {
  const catalogRoot = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  return handleGpxCatalogRequest(request, catalogRoot)
}

export const GET = withRateLimit(requestLimiter, handleGpxLibraryGet)
