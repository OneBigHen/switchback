import posthog, { type CaptureResult, type PostHogConfig } from "posthog-js"
import type { TelemetryAcknowledgement } from "./consent"
import type { TelemetryEventName, TelemetryEventProperties } from "./events"
import type { ReleaseContext } from "./release"
import { createReleaseContext } from "./release"
import { identifyTelemetry, resetTelemetryIdentity, type TelemetryIdentityProperties } from "./identity"
import { sanitizeCaptureResult, sanitizeTelemetryProperties, SENSITIVE_TELEMETRY_PROPERTY_DENYLIST } from "./privacy"
import { addReplayConfiguration } from "./replay"
import { withReleaseContext } from "./properties"
import { createWorkflowSpanTracker, type WorkflowSpanHandle, type WorkflowSpanProperties, type WorkflowName } from "./spans"
import type { TelemetryRuntimeConfig } from "./config"

export interface TelemetrySdk {
  init(token: string, config?: Partial<PostHogConfig>, name?: string): TelemetrySdk
  capture(eventName: string, properties?: Record<string, unknown> | null): unknown
  identify(identityId: string, properties?: Record<string, unknown>): void
  reset(): void
  opt_in_capturing(): void
}

export type TelemetryInitializationResult =
  | "initialized"
  | "already-initialized"
  | "disabled"
  | "waiting-for-acknowledgement"
  | "browser-unavailable"
  | "initialization-failed"

export interface TelemetryController {
  initialize(config: TelemetryRuntimeConfig, acknowledgement: TelemetryAcknowledgement | null): TelemetryInitializationResult
  capture<EventName extends TelemetryEventName>(
    eventName: EventName,
    properties: TelemetryEventProperties<EventName>
  ): void
  identify(identityId: string, properties?: TelemetryIdentityProperties): boolean
  resetIdentity(): void
  startWorkflow(workflow: WorkflowName, context?: Record<string, string | number | boolean>): WorkflowSpanHandle | null
  visibilityChanged(): void
  getReleaseContext(): ReleaseContext | null
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function posthogOptions(config: TelemetryRuntimeConfig): Partial<PostHogConfig> {
  return addReplayConfiguration({
    api_host: config.apiHost,
    ui_host: config.uiHost,
    defaults: "2026-08-30",
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: false,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_heatmaps: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { network_timing: true, web_vitals: true },
    person_profiles: "identified_only",
    opt_out_capturing_by_default: true,
    consent_persistence_name: "opengravel:posthog-consent",
    disable_capture_url_hashes: true,
    disable_session_recording: false,
    property_denylist: [...SENSITIVE_TELEMETRY_PROPERTY_DENYLIST],
    before_send: (capture: CaptureResult | null) => sanitizeCaptureResult(capture, config.projectToken)
  })
}

export function createTelemetryController(sdk: TelemetrySdk = posthog): TelemetryController {
  let instance: TelemetrySdk | null = null
  let releaseContext: ReleaseContext | null = null
  const sessionId = createSessionId()

  const capture = <EventName extends TelemetryEventName>(
    eventName: EventName,
    properties: TelemetryEventProperties<EventName>
  ): void => {
    if (!instance || !releaseContext) return
    try {
      instance.capture(eventName, sanitizeTelemetryProperties(withReleaseContext(releaseContext, properties)))
    } catch {
      // Observability is non-critical infrastructure. Product behavior must
      // continue when a browser extension, ad blocker, or SDK call fails.
    }
  }

  const spanTracker = createWorkflowSpanTracker({
    onComplete: (span: WorkflowSpanProperties) => capture("workflow_span_completed", span),
    visibility: () => typeof document === "undefined" || document.visibilityState === "visible" ? "visible" : "hidden"
  })

  return {
    initialize: (nextConfig, acknowledgement) => {
      if (!nextConfig.enabled || !nextConfig.projectToken) return "disabled"
      if (!acknowledgement
        || acknowledgement.version !== nextConfig.acknowledgementVersion
        || acknowledgement.decision !== "accepted") {
        return "waiting-for-acknowledgement"
      }
      if (instance) return "already-initialized"
      if (typeof window === "undefined") return "browser-unavailable"

      try {
        instance = sdk.init(nextConfig.projectToken, posthogOptions(nextConfig), "opengravel")
        releaseContext = createReleaseContext(nextConfig)
        instance.opt_in_capturing()
        return "initialized"
      } catch {
        instance = null
        releaseContext = null
        return "initialization-failed"
      }
    },
    capture,
    identify: (identityId, properties) => {
      if (!instance) return false
      try {
        return identifyTelemetry(instance, identityId, properties)
      } catch {
        return false
      }
    },
    resetIdentity: () => {
      if (!instance) return
      try {
        resetTelemetryIdentity(instance)
      } catch {
        // Identity reset is best effort and must not interrupt logout UI.
      }
    },
    startWorkflow: (workflow, context) => instance
      ? spanTracker.start(workflow, { ...context, session_id: sessionId })
      : null,
    visibilityChanged: spanTracker.visibilityChanged,
    getReleaseContext: () => releaseContext
  }
}

export const telemetry = createTelemetryController()
