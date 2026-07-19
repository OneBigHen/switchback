export interface RideResearchSource {
  title: string
  url: string
  summary: string
}

export interface RideResearchOptions {
  apiKey?: string
  fetcher?: typeof fetch
}

export class RideResearchError extends Error {
  constructor(readonly status: number) {
    super("Web ride research is temporarily unavailable.")
  }
}

interface YouSearchResult {
  title?: string
  url?: string
  description?: string
  snippets?: string[]
}

interface YouSearchPayload {
  results?: { web?: YouSearchResult[] }
  web?: YouSearchResult[]
}

function normalizeSource(result: YouSearchResult): RideResearchSource | null {
  const title = result.title?.trim()
  const url = result.url?.trim()
  if (!title || !url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
  } catch {
    return null
  }
  const summary = result.description?.trim() || result.snippets?.find((snippet) => snippet.trim())?.trim() || "Source available to review."
  return { title: title.slice(0, 180), url, summary: summary.slice(0, 360) }
}

export async function researchRideIdea(
  prompt: string,
  options: RideResearchOptions = {}
): Promise<RideResearchSource[]> {
  const query = prompt.trim()
  if (!query || !options.apiKey?.trim()) return []

  let response: Response
  try {
    response = await (options.fetcher ?? fetch)("https://api.you.com/v1/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": options.apiKey
      },
      body: JSON.stringify({
        query: `${query} motorcycle ride roads stops Pennsylvania`,
        count: 5,
        country: "US"
      }),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw new RideResearchError(503)
  }

  if (!response.ok) throw new RideResearchError(response.status)

  let payload: YouSearchPayload
  try {
    payload = await response.json() as YouSearchPayload
  } catch {
    throw new RideResearchError(502)
  }

  return (payload.results?.web ?? payload.web ?? [])
    .map(normalizeSource)
    .filter((source): source is RideResearchSource => source !== null)
    .slice(0, 5)
}
