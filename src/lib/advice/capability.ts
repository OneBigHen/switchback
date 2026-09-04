import path from "node:path"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { createGeminiAdviser } from "./gemini-adviser"
import { createAdvisorToolbox } from "./toolbox"
import type { RouteAdviser } from "./contracts"

/**
 * Server-declared advisor capability (ADR 0021).
 *
 * No key means the capability is absent: the API answers "disabled", the client
 * renders nothing, and core planning behavior is unchanged. Missing optional
 * sources remove only those sources.
 *
 * `GEMINI_API_KEY` enables the advisor and therefore documented data egress.
 * `GEMINI_MAPS_GROUNDING=0` disables Maps grounding while retaining the local
 * conversation/tools. Maps defaults on for compatibility with ADR 0023, but it
 * has separate Gemini API pricing; `.env.example` carries the current cost
 * warning rather than pretending it is an API Free Tier feature.
 * `CURVATURE_DB_PATH` adds locally scored road/gravel lookup when available.
 */

export interface AdvisorCapability {
  enabled: boolean
  sources: Array<"switchback-local" | "switchback-roads" | "google-maps">
  attributions: string[]
}

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
      ...(maps ? ["Grounded with Google Maps"] : [])
    ]
  }
}

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
                return []
              }
            }
          }
        : {})
    })
  })
}
