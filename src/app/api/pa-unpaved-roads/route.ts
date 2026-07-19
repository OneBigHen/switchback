import { fetchPaUnpavedRoads } from "@/lib/roads/pa-unpaved"
import { handlePaUnpavedRoadsRequest } from "./handler"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  return handlePaUnpavedRoadsRequest(request, fetchPaUnpavedRoads)
}
