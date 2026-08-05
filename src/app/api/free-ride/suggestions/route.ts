import path from "node:path"
import { handleFreeRideSuggestions } from "./handler"
import { CurvatureRepository } from "@/lib/curvature/repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request): Promise<Response> {
  const databasePath = process.env.CURVATURE_DB_PATH ?? path.join(process.cwd(), "data/segments.db")
  return handleFreeRideSuggestions(request, new CurvatureRepository(databasePath))
}
