import type { TelemetryRuntimeConfig } from "./config"

export type TelemetryDeviceClass = "mobile" | "tablet" | "desktop" | "unknown"
export type TelemetryPwaMode = "standalone" | "browser" | "unknown"

export interface ReleaseContext {
  app_release: string
  build_sha: string
  deployment_id: string
  telemetry_schema_version: string
  environment: string
  hosted_or_self_hosted: "hosted-beta" | "self-hosted"
  pwa_mode: TelemetryPwaMode
  device_class: TelemetryDeviceClass
}

interface BrowserSignals {
  innerWidth?: number
  matchMedia?: (query: string) => { matches: boolean }
  navigator?: { standalone?: boolean } | Navigator
}

function deviceClass(width: number | undefined): TelemetryDeviceClass {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return "unknown"
  if (width <= 760) return "mobile"
  if (width <= 1_024) return "tablet"
  return "desktop"
}

function pwaMode(signals: BrowserSignals): TelemetryPwaMode {
  const standalone = signals.navigator && "standalone" in signals.navigator
    ? signals.navigator.standalone === true
    : false
  if (standalone || signals.matchMedia?.("(display-mode: standalone)").matches === true) {
    return "standalone"
  }
  return signals.innerWidth === undefined && !signals.navigator && !signals.matchMedia ? "unknown" : "browser"
}

export function createReleaseContext(
  config: TelemetryRuntimeConfig,
  signals: BrowserSignals = typeof window === "undefined" ? {} : window
): ReleaseContext {
  return {
    app_release: config.release,
    build_sha: config.buildSha,
    deployment_id: config.deploymentId,
    telemetry_schema_version: config.schemaVersion,
    environment: config.environment,
    hosted_or_self_hosted: config.deploymentMode,
    pwa_mode: pwaMode(signals),
    device_class: deviceClass(signals.innerWidth)
  }
}
