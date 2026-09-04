import path from "node:path"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { createGeminiAdviser } from "./gemini-adviser"
import { createAdvisorToolbox } from "./toolbox"
import type { RouteAdviser } from "./contracts"

/**
 * Server-declared advisor capability (ADR 0021).
 *
 * No key means the capability is simply absent: the API answers "disabled", the
 * client renders nothing, and the core product is byte-for-byte what it was.
 * There is no client flag, no billing, and nothing in the UI that mentions
 * upgrading. A missing optional source disables only that source, never the
 * advisor as a whole.
 *
 * Switches, in order of consequence:
 *
 * - `GEMINI_API_KEY` turns the advisor on at all. Route geometry and the
 *   rider's messages leave the instance when it is set, so it is opt-in and
 *   documented as data egress in `.env.example`.
 * - `GEMINI_MAPS_GROUNDING=0` turns off Grounding with Google Maps while
 *   leaving the advisor running on Switchback's own data. It defaults ON
 *   because it is what makes the co-pilot worth talking to, and because it is
 *   inside the Gemini free tier — but it is one variable to switch off, and
 *   `usage.groundedQueries` reports every call it makes.
 * - `CURVATURE_DB_PATH` (already used by the map layer) additionally lets the
 *   advisor hunt for scored roads and gravel. Absent just means that one tool
 *   is not offered.
 */

export interface AdvisorCapability {
  /** Whether the advisor exists on this deployment at all. */
  enabled: boolean
  /** What it can actually consult, for honest UI. */
  sources: Array<"switchback-local" | "switchback-roads" | "google-maps">
  /** Attribution lines that must be rendered when a reply cites a source. */
  attributions: string[]
}

/** The server env this reads. Index-signed so `process.env` satisfies it. */
export interface AdvisorEnvironment {
  readonly [key: string]: string | undefined
  readonly GEMINI_API_KEY?: string
  readonly GEMINI_ADVISOR_MODEL?: string
  readonly GEMINI_MAPS_GROUNDING?: string
  readonly CURVATURE_DB_PATH?: string
  readonly PHOTON_URL?: string
}

const ABSENT: AdvisorCapability = { enabled: false, sources: [], attributions: [] }

/** Maps grounding is on unless explicitly switched off. */
export function mapsGroundingEnabled(env: AdvisorEnvironment): boolean {
  const flag = env.GEMINI_MAPS_GROUNDING?.trim().toLowerCase()
  return flag !== "0" && flag !== "false" && flag !== "off"
}

function curvaturePath(env: AdvisorEnvironment): string | null {
  const configured = env.CURVATURE_DB_PATH?.trim()
  return configured ? path.resolve(configured) : null
}

export function resolveAdvisorCapability(env: AdvisorEnvironment): AdvisorCapability {
  if (!env.GEMINI_API_KEY?.trim()) return ABSENT
  const maps = mapsGroundingEnabled(env)
  const roads = curvaturePath(env) !== null
  return {
    enabled: true,
    sources: [
      "switchback-local",
      ...(roads ? ["switchback-roads" as const] : []),
      ...(maps ? ["google-maps" as const] : [])
    ],
    attributions: [
      "Place data © OpenStreetMap contributors",
      // Required wording; never localized or restyled.
      ...(maps ? ["Grounded with Google Maps"] : [])
    ]
  }
}

/** Build the adviser for this deployment, or null when the capability is absent. */
export function createAdviserFromEnvironment(env: AdvisorEnvironment): RouteAdviser | null {
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null

  const databasePath = curvaturePath(env)
  const repository = databasePath ? new CurvatureRepository(databasePath) : null

  return createGeminiAdviser({
    apiKey,
    ...(env.GEMINI_ADVISOR_MODEL?.trim() ? { model: env.GEMINI_ADVISOR_MODEL.trim() } : {}),
    mapsGrounding: mapsGroundingEnabled(env),
    toolbox: createAdvisorToolbox({
      ...(env.PHOTON_URL?.trim() ? { geocoderUrl: env.PHOTON_URL.trim() } : {}),
      ...(repository
        ? {
            queryRoads: (bounds) => {
              try {
                return repository.queryBounds(bounds)
              } catch {
                // A missing or unreadable curvature database degrades the road
                // tool, never the conversation.
                return []
              }
            }
          }
        : {})
    })
  })
}
