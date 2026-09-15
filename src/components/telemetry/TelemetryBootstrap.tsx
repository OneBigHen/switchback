"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { TelemetryAcknowledgement } from "./TelemetryAcknowledgement"
import {
  fetchTelemetryRuntimeConfig,
  getClientTelemetryConfig,
  type TelemetryRuntimeConfig
} from "@/lib/telemetry/config"
import {
  readTelemetryAcknowledgement,
  writeTelemetryAcknowledgement,
  type StorageLike,
  type TelemetryAcknowledgement as TelemetryAcknowledgementRecord
} from "@/lib/telemetry/consent"
import { telemetry, type TelemetryController } from "@/lib/telemetry/client"

interface TelemetryBootstrapProps {
  children: ReactNode
  /** Dependency seams keep the gate deterministic without contacting PostHog in tests. */
  initialConfig?: TelemetryRuntimeConfig
  loadConfig?: () => Promise<TelemetryRuntimeConfig | null>
  controller?: TelemetryController
  storage?: StorageLike | null
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function captureAcknowledgement(
  controller: TelemetryController,
  acknowledgement: TelemetryAcknowledgementRecord,
  result: ReturnType<TelemetryController["initialize"]>
): void {
  if (result === "disabled" || result === "waiting-for-acknowledgement" || result === "browser-unavailable") return
  controller.capture("beta_telemetry_acknowledged", {
    acknowledgement_version: acknowledgement.version,
    acknowledged_at: acknowledgement.acknowledgedAt
  })
  if (result === "initialized") controller.capture("app_opened", { entry_surface: "unknown" })
}

export function TelemetryBootstrap({
  children,
  initialConfig,
  loadConfig: loadConfigOverride,
  controller = telemetry,
  storage: storageOverride
}: TelemetryBootstrapProps) {
  const buildConfig = initialConfig ?? getClientTelemetryConfig()
  const loadConfig = loadConfigOverride ?? fetchTelemetryRuntimeConfig
  const storage = useMemo(() => storageOverride === undefined ? browserStorage() : storageOverride, [storageOverride])
  const storageRef = useRef<StorageLike | null>(storage)
  const [runtimeConfig, setRuntimeConfig] = useState(buildConfig)
  const [acknowledgement, setAcknowledgement] = useState<TelemetryAcknowledgementRecord | null>(
    () => storageOverride === undefined ? null : readTelemetryAcknowledgement(storage)
  )
  const [dismissedAcknowledgementVersion, setDismissedAcknowledgementVersion] = useState<string | null>(null)
  const [configurationReady, setConfigurationReady] = useState(false)
  const visibilityTimingRef = useRef<{ foregroundStartedAt: number; backgroundedAt: number | null }>({
    foregroundStartedAt: 0,
    backgroundedAt: null
  })

  useEffect(() => {
    storageRef.current = storage
    let disposed = false
    void Promise.resolve()
      .then(() => {
        if (!disposed) setAcknowledgement(readTelemetryAcknowledgement(storage))
        return loadConfig()
      })
      .then((remoteConfig) => {
        if (!disposed && remoteConfig) setRuntimeConfig(remoteConfig)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) setConfigurationReady(true)
      })
    return () => {
      disposed = true
    }
  }, [loadConfig, storage])

  useEffect(() => {
    if (!configurationReady || !runtimeConfig.enabled || acknowledgement?.decision !== "accepted") return
    const result = controller.initialize(runtimeConfig, acknowledgement)
    if (result === "initialized") controller.capture("app_opened", { entry_surface: "unknown" })
  }, [acknowledgement, configurationReady, controller, runtimeConfig])

  useEffect(() => {
    if (!configurationReady || !runtimeConfig.enabled || acknowledgement?.decision !== "accepted") return
    const handleOffline = () => controller.capture("offline_mode_entered", {
      offline_reason: "browser-offline"
    })
    window.addEventListener("offline", handleOffline)
    return () => window.removeEventListener("offline", handleOffline)
  }, [acknowledgement, configurationReady, controller, runtimeConfig])

  useEffect(() => {
    if (!configurationReady || !runtimeConfig.enabled || acknowledgement?.decision !== "accepted") return
    const handleInstallPrompt = () => controller.capture("pwa_install_prompt_shown", {
      surface: "unknown"
    })
    const handleInstalled = () => controller.capture("pwa_installed", {
      surface: "unknown"
    })
    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [acknowledgement, configurationReady, controller, runtimeConfig])

  useEffect(() => {
    if (!configurationReady || !runtimeConfig.enabled || acknowledgement?.decision !== "accepted") return
    const handleVisibilityChange = () => {
      controller.visibilityChanged()
      const now = Date.now()
      const timing = visibilityTimingRef.current
      if (timing.foregroundStartedAt === 0) timing.foregroundStartedAt = now
      if (document.visibilityState === "hidden") {
        if (timing.backgroundedAt !== null) return
        timing.backgroundedAt = now
        controller.capture("app_backgrounded", {
          foreground_duration_ms: Math.max(0, now - timing.foregroundStartedAt)
        })
        return
      }
      if (timing.backgroundedAt === null) return
      controller.capture("app_resumed", {
        background_duration_ms: Math.max(0, now - timing.backgroundedAt)
      })
      timing.backgroundedAt = null
      timing.foregroundStartedAt = now
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [acknowledgement, configurationReady, controller, runtimeConfig])

  const accept = () => {
    const next = writeTelemetryAcknowledgement(storageRef.current, "accepted")
    setAcknowledgement(next)
    const result = controller.initialize(runtimeConfig, next)
    captureAcknowledgement(controller, next, result)
  }

  const decline = () => {
    setAcknowledgement(writeTelemetryAcknowledgement(storageRef.current, "declined"))
    setDismissedAcknowledgementVersion(runtimeConfig.acknowledgementVersion)
  }

  const needsAcknowledgement = configurationReady
    && runtimeConfig.enabled
    && dismissedAcknowledgementVersion !== runtimeConfig.acknowledgementVersion
    && (acknowledgement?.version !== runtimeConfig.acknowledgementVersion
      || acknowledgement?.decision !== "accepted")

  return (
    <>
      {children}
      {needsAcknowledgement ? <TelemetryAcknowledgement onAccept={accept} onDecline={decline} /> : null}
    </>
  )
}
