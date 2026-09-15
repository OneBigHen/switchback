export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"
export const DEFAULT_POSTHOG_UI_HOST = "https://us.posthog.com"
export const DEFAULT_TELEMETRY_SCHEMA_VERSION = "1"
export const TELEMETRY_ACKNOWLEDGEMENT_VERSION = "2026-09-14.v1"

export type TelemetryDeploymentMode = "hosted-beta" | "self-hosted"

export interface TelemetryEnvironment {
  readonly [key: string]: string | undefined
}

export interface TelemetryRuntimeConfig {
  enabled: boolean
  projectToken: string
  apiHost: string
  uiHost: string
  release: string
  buildSha: string
  deploymentId: string
  schemaVersion: string
  environment: string
  deploymentMode: TelemetryDeploymentMode
  acknowledgementVersion: string
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "")
}

function normalizeHost(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback
  try {
    const url = new URL(candidate)
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback
    return url.origin
  } catch {
    return fallback
  }
}

function deploymentMode(value: string | undefined): TelemetryDeploymentMode {
  return value?.trim().toLowerCase() === "self-hosted" ? "self-hosted" : "hosted-beta"
}

/**
 * Resolve the server/build environment into the small configuration object
 * the browser is allowed to know. The project token is public PostHog
 * configuration, while personal API keys are deliberately not part of this
 * contract.
 */
export function resolveTelemetryConfig(environment: TelemetryEnvironment = process.env): TelemetryRuntimeConfig {
  const projectToken = environment.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? ""
  const enabledFlag = environment.TELEMETRY_ENABLED

  return {
    enabled: parseBoolean(enabledFlag) && projectToken.length > 0,
    projectToken,
    apiHost: normalizeHost(environment.NEXT_PUBLIC_POSTHOG_HOST, DEFAULT_POSTHOG_HOST),
    uiHost: normalizeHost(environment.NEXT_PUBLIC_POSTHOG_UI_HOST, DEFAULT_POSTHOG_UI_HOST),
    release: environment.NEXT_PUBLIC_OPENGRAVEL_RELEASE?.trim() || "development",
    buildSha: environment.NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA?.trim() || "unknown",
    deploymentId: environment.NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID?.trim() || "local",
    schemaVersion: environment.NEXT_PUBLIC_OPENGRAVEL_TELEMETRY_SCHEMA?.trim() || DEFAULT_TELEMETRY_SCHEMA_VERSION,
    environment: environment.NODE_ENV?.trim() || "development",
    deploymentMode: deploymentMode(environment.NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_MODE),
    acknowledgementVersion: TELEMETRY_ACKNOWLEDGEMENT_VERSION
  }
}

/**
 * Only NEXT_PUBLIC_* values are available to a client bundle. The dynamic
 * config endpoint provides the private enable switch at runtime; this
 * build-time snapshot is a fail-closed fallback when that request is unavailable.
 */
export function getClientTelemetryConfig(): TelemetryRuntimeConfig {
  return resolveTelemetryConfig({
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_UI_HOST: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST,
    NEXT_PUBLIC_OPENGRAVEL_RELEASE: process.env.NEXT_PUBLIC_OPENGRAVEL_RELEASE,
    NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA: process.env.NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA,
    NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID: process.env.NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID,
    NEXT_PUBLIC_OPENGRAVEL_TELEMETRY_SCHEMA: process.env.NEXT_PUBLIC_OPENGRAVEL_TELEMETRY_SCHEMA,
    NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_MODE: process.env.NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_MODE,
    NODE_ENV: process.env.NODE_ENV
  })
}

export function isTelemetryConfig(value: unknown): value is TelemetryRuntimeConfig {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<TelemetryRuntimeConfig>
  return typeof candidate.enabled === "boolean"
    && typeof candidate.projectToken === "string"
    && typeof candidate.apiHost === "string"
    && typeof candidate.uiHost === "string"
    && typeof candidate.release === "string"
    && typeof candidate.buildSha === "string"
    && typeof candidate.deploymentId === "string"
    && typeof candidate.schemaVersion === "string"
    && typeof candidate.environment === "string"
    && (candidate.deploymentMode === "hosted-beta" || candidate.deploymentMode === "self-hosted")
    && typeof candidate.acknowledgementVersion === "string"
}

export async function fetchTelemetryRuntimeConfig(
  fetcher: typeof fetch = fetch
): Promise<TelemetryRuntimeConfig | null> {
  try {
    const response = await fetcher("/api/telemetry/config", { cache: "no-store" })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    return isTelemetryConfig(payload) ? payload : null
  } catch {
    return null
  }
}
