import path from "node:path"
import { handleGpxCatalogRequest } from "./handler"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const catalogRoot = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  return handleGpxCatalogRequest(request, catalogRoot)
}
