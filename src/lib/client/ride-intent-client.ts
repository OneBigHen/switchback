import { parseRidePromptLocally, type RideIntent } from "@/lib/ai/ride-intent"

interface RideIntentErrorPayload {
  error?: { code?: string; message?: string }
}

export class RideIntentClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

/**
 * Bind origin authority back to the rider's literal prompt.
 *
 * The remote interpreter may enrich route character, destination, duration,
 * and other ride semantics, but it is never allowed to manufacture the
 * geographic origin. The deterministic local parser is deliberately the
 * authority for whether the rider actually named a start. This also turns
 * model control language such as "unspecified" into no explicit origin rather
 * than a geocodable place.
 */
export function enforceRiderOriginAuthority(
  prompt: string,
  interpreted: RideIntent
): RideIntent {
  const riderAuthored = parseRidePromptLocally(prompt)
  return {
    ...interpreted,
    startQuery: riderAuthored.startQuery
  }
}

export async function requestRideIntent(
  prompt: string,
  fetcher: typeof fetch = fetch
): Promise<RideIntent> {
  let response: Response
  try {
    response = await fetcher("/api/ride-intent", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim() })
    })
  } catch {
    throw new RideIntentClientError(
      "Switchback could not reach the ride interpreter.",
      "RIDE_INTENT_UNREACHABLE",
      503
    )
  }

  let payload: RideIntent | RideIntentErrorPayload
  try {
    payload = await response.json() as RideIntent | RideIntentErrorPayload
  } catch {
    throw new RideIntentClientError(
      "The ride interpreter returned an unreadable response.",
      "INVALID_RIDE_INTENT_RESPONSE",
      502
    )
  }
  if (!response.ok) {
    const error = (payload as RideIntentErrorPayload).error
    throw new RideIntentClientError(
      error?.message ?? "This ride description could not be interpreted.",
      error?.code ?? "RIDE_INTENT_UNAVAILABLE",
      response.status
    )
  }
  return enforceRiderOriginAuthority(prompt, payload as RideIntent)
}
