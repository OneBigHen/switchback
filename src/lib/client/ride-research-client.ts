import type { RideResearchSource } from "@/lib/ai/ride-research"

interface ResearchPayload {
  sources?: RideResearchSource[]
  error?: { message?: string }
}

export async function requestRideResearch(
  prompt: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RideResearchSource[]> {
  const response = await fetcher("/api/ride-research", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ prompt }),
    signal
  })
  const payload = await response.json() as ResearchPayload
  if (!response.ok || !Array.isArray(payload.sources)) {
    throw new Error(payload.error?.message ?? "Web ride research is unavailable.")
  }
  return payload.sources
}
