import {
  OfflineRegionFileError,
  readActiveManifest,
  readManifestTile
} from "@/lib/server/offline-region-files"

interface RouteContext {
  params: Promise<{ regionId: string; tileId: string }>
}

function failure(error: unknown): Response {
  const status = error instanceof OfflineRegionFileError ? error.status : 500
  const message = error instanceof OfflineRegionFileError ? error.message : "Offline tile unavailable"
  return Response.json({ error: message }, { status })
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null
  const match = /^bytes=(\d+)-(\d*)$/.exec(value)
  if (!match) return "invalid"
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return "invalid"
  }
  return { start, end: Math.min(end, size - 1) }
}

function responseBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function serve(request: Request, context: RouteContext, includeBody: boolean): Promise<Response> {
  try {
    const { regionId, tileId } = await context.params
    const manifest = await readActiveManifest(regionId)
    const tile = await readManifestTile(manifest, tileId)
    const etag = `"sha256-${tile.sha256}"`
    const baseHeaders: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Encoding": "zstd",
      "Content-Type": "application/json",
      ETag: etag
    }

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: baseHeaders })
    }

    const range = parseRange(request.headers.get("range"), tile.bytes.byteLength)
    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${tile.bytes.byteLength}` }
      })
    }
    if (range) {
      const body = tile.bytes.slice(range.start, range.end + 1)
      return new Response(includeBody ? responseBody(body) : null, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(body.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${tile.bytes.byteLength}`
        }
      })
    }
    return new Response(includeBody ? responseBody(tile.bytes) : null, {
      headers: { ...baseHeaders, "Content-Length": String(tile.bytes.byteLength) }
    })
  } catch (error) {
    return failure(error)
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return serve(request, context, true)
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return serve(request, context, false)
}
