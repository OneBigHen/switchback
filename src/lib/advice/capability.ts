import { createGoogleMapsGrounding } from "./google-maps-grounding"
import { createLocalGrounding } from "./local-grounding"
import { createOpenRouterAdviser } from "./openrouter-adviser"
import type { GroundingSource, RouteAdviser } from "./contracts"

/**
 * Server-declared advisor capability (ADR 0021).
 *
 * No key means the capability is simply absent: the API answers "disabled", the
 * client renders nothing, and the core product is byte-for-byte what it was.
 * There is no client flag, no billing, and nothing in the UI that mentions
 * upgrading. A missing optional key disables only that one source, never the
 * advisor as a whole.
 *
 * Two independent switches, because they carry different consequences:
 *
 * - `OPENROUTER_API_KEY` turns the advisor on at all. Route geometry and
 *   waypoints leave the instance when it is set, so it is opt-in and documented
 *   as data egress.
 * - `GOOGLE_MAPS_GROUNDING=1` plus `GOOGLE_MAPS_API_KEY` adds Grounding with
 *   Google Maps. OFF by default and gated separately: it is a paid per-query
 *   source, it carries display-attribution obligations, and whether Switchback
 *   should use Maps content at all is an owner decision (ADR 0023).
 */

export interface AdvisorCapability {
  /** Whether the advisor exists on this deployment at all. */
  enabled: boolean
  /** Grounding sources actually available, for honest UI. */
  groundingSources: Array<"switchback-local" | "google-maps">
  /** Attribution lines that must be rendered when a reply cites a source. */
  attributions: string[]
}

/** The server env this reads. Index-signed so `process.env` satisfies it. */
export interface AdvisorEnvironment {
  readonly [key: string]: string | undefined
  readonly OPENROUTER_API_KEY?: string
  readonly OPENROUTER_ADVISOR_MODEL?: string
  readonly GOOGLE_MAPS_API_KEY?: string
  readonly GOOGLE_MAPS_GROUNDING?: string
  readonly PHOTON_URL?: string
}

function googleMapsGroundingEnabled(env: AdvisorEnvironment): boolean {
  const flag = env.GOOGLE_MAPS_GROUNDING?.trim().toLowerCase()
  return (flag === "1" || flag === "true") && Boolean(env.GOOGLE_MAPS_API_KEY?.trim())
}

export function resolveAdvisorCapability(env: AdvisorEnvironment): AdvisorCapability {
  if (!env.OPENROUTER_API_KEY?.trim()) {
    return { enabled: false, groundingSources: [], attributions: [] }
  }
  const maps = googleMapsGroundingEnabled(env)
  return {
    enabled: true,
    groundingSources: maps ? ["switchback-local", "google-maps"] : ["switchback-local"],
    attributions: [
      "Place data © OpenStreetMap contributors",
      ...(maps ? ["Grounded with Google Maps"] : [])
    ]
  }
}

/** Build the adviser for this deployment, or null when the capability is absent. */
export function createAdviserFromEnvironment(env: AdvisorEnvironment): RouteAdviser | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) return null

  const grounding: GroundingSource[] = [
    createLocalGrounding({
      ...(env.PHOTON_URL?.trim() ? { geocoderUrl: env.PHOTON_URL.trim() } : {})
    })
  ]
  if (googleMapsGroundingEnabled(env)) {
    grounding.push(createGoogleMapsGrounding({ apiKey: env.GOOGLE_MAPS_API_KEY!.trim() }))
  }

  return createOpenRouterAdviser({
    apiKey,
    ...(env.OPENROUTER_ADVISOR_MODEL?.trim() ? { model: env.OPENROUTER_ADVISOR_MODEL.trim() } : {}),
    grounding
  })
}
