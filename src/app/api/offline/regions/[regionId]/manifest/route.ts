import { createHash } from "node:crypto"

import {
  OfflineRegionFileError,
  readActiveManifest
} from "@/lib/server/offline-region-files"

interface RouteContext {
  params: Promise<{ regionId: string }>
}

function failure(error: unknown): Response {
  const status = error instanceof OfflineRegionFileError ? error.status : 500
  const message = error instanceof OfflineRegionFileError ? error.message : "Offline manifest unavailable"
  return Response.json({ error: message }, { status })
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
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
