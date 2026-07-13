import path from "node:path"
import { handleCurvatureRequest } from "./handler"
import { CurvatureRepository } from "@/lib/curvature/repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const databasePath = process.env.CURVATURE_DB_PATH ?? path.join(process.cwd(), "data/segments.db")
  return handleCurvatureRequest(request, new CurvatureRepository(databasePath))
}
