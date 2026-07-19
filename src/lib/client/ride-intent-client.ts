import type { RideIntent } from "@/lib/ai/ride-intent"

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
  return payload as RideIntent
}
