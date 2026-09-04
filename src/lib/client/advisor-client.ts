import type {
  AdvisorMessage,
  AdvisorReply,
  AdvisorRouteContext
} from "@/lib/advice/contracts"
import { emptyReply } from "@/lib/advice/contracts"
import type { AdvisorCapability } from "@/lib/advice/capability"

/**
 * Client side of the advisor turn endpoint.
 *
 * The transcript lives in the browser and is posted back each turn. Transport
 * failures are deliberately flattened into advisor statuses so this optional
 * surface cannot break planning, but useful distinctions such as a 429 are
 * preserved for honest UI and retry behavior.
 */

export interface AdvisorTurnResponse extends AdvisorReply {
  capability: AdvisorCapability
}

const ABSENT_CAPABILITY: AdvisorCapability = {
  enabled: false,
  sources: [],
  attributions: []
}

export async function fetchAdvisorCapability(
  signal?: AbortSignal
): Promise<AdvisorCapability> {
  try {
    const response = await fetch("/api/advisor", { ...(signal ? { signal } : {}) })
    if (!response.ok) return ABSENT_CAPABILITY
    const payload = await response.json() as { capability?: AdvisorCapability }
    return payload.capability ?? ABSENT_CAPABILITY
  } catch {
    return ABSENT_CAPABILITY
  }
}

export interface AdvisorTurnInput {
  /** Null while the rider is building a ride and the advisor is helping. */
  context: AdvisorRouteContext | null
  conversation: AdvisorMessage[]
  riderMessage?: string
  /** Explicit planner start, so place search works before a route exists. */
  origin?: { lat: number; lon: number; label?: string }
}

export async function requestAdvisorTurn(
  input: AdvisorTurnInput,
  signal?: AbortSignal
): Promise<AdvisorTurnResponse> {
  try {
    const response = await fetch("/api/advisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {})
    })
    if (response.status === 429) {
      return { ...emptyReply("rate-limited"), capability: ABSENT_CAPABILITY }
    }
    if (!response.ok) {
      return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
    }
    return await response.json() as AdvisorTurnResponse
  } catch {
    return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
  }
}
