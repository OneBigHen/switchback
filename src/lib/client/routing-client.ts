import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"

interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

export class RoutingClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function requestTripPlan(
  request: TripPlanRequest,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TripPlan> {
  let response: Response
  try {
    response = await fetcher("/api/routes", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(request),
      signal
    })
  } catch {
    throw new RoutingClientError(
      "Switchback could not reach the routing service.",
      "ROUTER_UNREACHABLE",
      503
    )
  }

  let payload: TripPlan | ApiErrorPayload
  try {
    payload = await response.json() as TripPlan | ApiErrorPayload
  } catch {
    throw new RoutingClientError(
      "The routing service returned an unreadable response.",
      "INVALID_ROUTE_RESPONSE",
      502
    )
  }

  if (!response.ok) {
    const apiError = (payload as ApiErrorPayload).error
    throw new RoutingClientError(
      apiError?.message ?? "This trip could not be routed.",
      apiError?.code ?? "ROUTE_PLANNING_FAILED",
      response.status
    )
  }

  return payload as TripPlan
}
