import type { AutocaptureConfig, PostHogConfig, SessionRecordingOptions } from "posthog-js"
import { sanitizeCapturedNetworkRequest } from "./privacy"

export const REPLAY_BLOCK_SELECTOR = [
  "canvas",
  'input[type="file"]',
  "[data-telemetry-replay-block=\"true\"]",
  "[data-ph-no-capture=\"true\"]"
].join(", ")

export const REPLAY_MASK_SELECTOR = [
  ".ph-mask",
  "[data-telemetry-replay-mask=\"true\"]"
].join(", ")

export function createTelemetryAutocaptureConfig(): AutocaptureConfig {
  return {
    dom_event_allowlist: ["click", "change", "submit"],
    element_allowlist: ["a", "button", "form", "select", "label"],
    css_selector_ignorelist: [
      ".ph-no-autocapture",
      "[data-ph-no-autocapture]",
      ".ph-no-capture",
      "[data-ph-no-capture]",
      "[data-telemetry-replay-block=\"true\"]"
    ],
    element_attribute_ignorelist: ["value", "placeholder", "aria-label", "name", "data-value"]
  }
}

export function createTelemetrySessionRecordingOptions(): SessionRecordingOptions {
  return {
    blockClass: "ph-no-capture",
    blockSelector: REPLAY_BLOCK_SELECTOR,
    maskTextClass: "ph-mask",
    maskTextSelector: REPLAY_MASK_SELECTOR,
    maskAllInputs: true,
    recordHeaders: false,
    recordBody: false,
    captureCanvas: { recordCanvas: false },
    canvasCapture: { maskRegionsFn: () => null },
    maskCapturedNetworkRequestFn: sanitizeCapturedNetworkRequest
  }
}

export function addReplayConfiguration(config: Partial<PostHogConfig>): Partial<PostHogConfig> {
  return {
    ...config,
    autocapture: createTelemetryAutocaptureConfig(),
    session_recording: createTelemetrySessionRecordingOptions()
  }
}
