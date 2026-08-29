"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  PlannerProviderHealthStatus,
  PlannerProviderHealthViewModel
} from "./PlannerDeckViewModel"

interface ProviderHealthProbe {
  ok: boolean
  status: number
  latencyMs: number
}

interface CanonicalHealthResponse {
  ok: boolean
  degraded: boolean
  app: { ok: boolean }
  router: ProviderHealthProbe
  providers: {
    graphhopper: ProviderHealthProbe
    valhalla?: ProviderHealthProbe
  }
  degradedProviders: string[]
  runtime: object
}

function isProviderHealth(value: unknown): value is ProviderHealthProbe {
  if (value == null || typeof value !== "object") return false
  const provider = value as Record<string, unknown>
  return typeof provider.ok === "boolean"
    && typeof provider.status === "number"
    && Number.isInteger(provider.status)
    && provider.status >= 0
    && typeof provider.latencyMs === "number"
    && Number.isFinite(provider.latencyMs)
    && provider.latencyMs >= 0
}

function isCanonicalHealthResponse(value: unknown): value is CanonicalHealthResponse {
  if (value == null || typeof value !== "object") return false
  const body = value as Record<string, unknown>
  if (body.providers == null || typeof body.providers !== "object" || Array.isArray(body.providers)) return false
  if (typeof body.ok !== "boolean" || typeof body.degraded !== "boolean") return false
  if (body.app == null || typeof body.app !== "object" || Array.isArray(body.app) || typeof (body.app as Record<string, unknown>).ok !== "boolean") return false
  if (!isProviderHealth(body.router) || !Array.isArray(body.degradedProviders) || !body.degradedProviders.every((name) => typeof name === "string")) return false
  if (body.runtime == null || typeof body.runtime !== "object" || Array.isArray(body.runtime)) return false
  const providers = body.providers as Record<string, unknown>
  if (!isProviderHealth(providers.graphhopper)) return false
  if (providers.valhalla !== undefined && !isProviderHealth(providers.valhalla)) return false

  const canonical = body as unknown as CanonicalHealthResponse
  const graphhopper = canonical.providers.graphhopper
  const valhalla = canonical.providers.valhalla
  const expectedDegradedProviders = [
    ...(graphhopper.ok ? [] : ["graphhopper"]),
    ...(valhalla && !valhalla.ok ? ["valhalla"] : [])
  ]
  return canonical.app.ok === true
    && canonical.ok === graphhopper.ok
    && canonical.degraded === Boolean(valhalla && !valhalla.ok)
    && canonical.router.ok === graphhopper.ok
    && canonical.router.status === graphhopper.status
    && canonical.router.latencyMs === graphhopper.latencyMs
    && canonical.degradedProviders.length === expectedDegradedProviders.length
    && canonical.degradedProviders.every((name, index) => name === expectedDegradedProviders[index])
}

function statusFromHealth(body: CanonicalHealthResponse): PlannerProviderHealthStatus {
  if (!body.providers.graphhopper.ok) return "graphhopper-unavailable"
  if (body.providers.valhalla && !body.providers.valhalla.ok) return "valhalla-degraded"
  return "healthy"
}

export interface ProviderHealthHookResult extends PlannerProviderHealthViewModel {
  retry(): void
}

/**
 * Polls the server's canonical /api/health response only while the planner is
 * visible. It deliberately keeps health in component state: provider status
 * is a transient hint, never rider data to persist.
 */
export function useProviderHealth(enabled: boolean): ProviderHealthHookResult {
  // Keep the first render deterministic for server/client hydration; the
  // mounted effect below applies the browser's current connectivity state.
  const [status, setStatus] = useState<PlannerProviderHealthStatus>("unknown")
  const controllerRef = useRef<AbortController | null>(null)

  const probe = useCallback(() => {
    if (!enabled || typeof navigator !== "undefined" && !navigator.onLine) {
      if (typeof navigator !== "undefined" && !navigator.onLine) setStatus("offline")
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus("checking")
    void fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json()
        if (!isCanonicalHealthResponse(body)) throw new Error("Malformed provider health response")
        const canonical = body as CanonicalHealthResponse
        const expectedStatus = canonical.ok ? 200 : 503
        if (response.ok !== canonical.ok || response.status !== expectedStatus) {
          throw new Error("Inconsistent provider health response")
        }
        return body
      })
      .then((body) => {
        if (!controller.signal.aborted) setStatus(statusFromHealth(body))
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unverified")
      })
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let disposed = false

    const handleOffline = () => {
      controllerRef.current?.abort()
      controllerRef.current = null
      setStatus("offline")
    }
    const handleOnline = () => probe()
    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    // Defer the initial state transition until after subscriptions are set up;
    // this also avoids a cascading render from the effect body.
    queueMicrotask(() => {
      if (disposed) return
      if (navigator.onLine) probe()
      else setStatus("offline")
    })
    const interval = window.setInterval(probe, 60_000)

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [enabled, probe])

  return { status, retry: probe }
}

interface ProviderHealthNoticeProps {
  health?: PlannerProviderHealthViewModel
  onRetry?: () => void
}

export function ProviderHealthNotice({ health, onRetry }: ProviderHealthNoticeProps) {
  switch (health?.status) {
    case "graphhopper-unavailable":
      return (
        <div className="provider-health-notice provider-health-notice-alert" role="alert" aria-live="polite">
          <WarningCircle weight="fill" aria-hidden="true" />
          <p>The route service is temporarily unavailable. Nothing was lost — try again in a moment.</p>
          <button type="button" className="provider-health-retry" onClick={onRetry}>Retry</button>
        </div>
      )
    case "valhalla-degraded":
      return (
        <div className="provider-health-notice provider-health-notice-status" role="status" aria-live="polite">
          <WarningCircle weight="fill" aria-hidden="true" />
          <p>Optional route comparison is unavailable. Planning remains available.</p>
        </div>
      )
    case "offline":
      return <p className="provider-health-notice provider-health-notice-status" role="status">You&apos;re offline. Provider status will update when you&apos;re back online.</p>
    case "unverified":
      return <p className="provider-health-notice provider-health-notice-status" role="status">Provider status could not be checked. Planning may still work.</p>
    default:
      return null
  }
}
