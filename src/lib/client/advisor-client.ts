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
 * The transcript lives here, in the browser, and is posted back each turn: the
 * server stores nothing about a rider's conversation. Every failure resolves to
 * a reply with a status — the advisor is optional evidence and must never break
 * or block planning.
 */

export interface AdvisorTurnResponse extends AdvisorReply {
  capability: AdvisorCapability
}

const ABSENT_CAPABILITY: AdvisorCapability = {
  enabled: false,
  groundingSources: [],
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
  context: AdvisorRouteContext
  conversation: AdvisorMessage[]
  riderMessage?: string
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
    if (!response.ok) {
      return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
    }
    return await response.json() as AdvisorTurnResponse
  } catch {
    return { ...emptyReply("unavailable"), capability: ABSENT_CAPABILITY }
  }
}
