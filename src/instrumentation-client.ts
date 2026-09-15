import { fetchTelemetryRuntimeConfig, getClientTelemetryConfig } from "@/lib/telemetry/config"
import { readTelemetryAcknowledgement } from "@/lib/telemetry/consent"
import { telemetry } from "@/lib/telemetry/client"

function startForPreviouslyAcknowledgedBrowser(): void {
  if (typeof window === "undefined") return
  let acknowledgement = null
  try {
    acknowledgement = readTelemetryAcknowledgement(window.localStorage)
  } catch {
    return
  }
  if (!acknowledgement || acknowledgement.decision !== "accepted") return

  void fetchTelemetryRuntimeConfig().then((runtimeConfig) => {
    const result = telemetry.initialize(runtimeConfig ?? getClientTelemetryConfig(), acknowledgement)
    if (result === "initialized") telemetry.capture("app_opened", { entry_surface: "unknown" })
  })
}

if (typeof window !== "undefined") {
  startForPreviouslyAcknowledgedBrowser()
  window.addEventListener("visibilitychange", () => telemetry.visibilityChanged())
}
