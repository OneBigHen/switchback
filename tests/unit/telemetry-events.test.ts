import { describe, expect, it } from "vitest"
import {
  TELEMETRY_EVENTS,
  isTelemetryEventName,
  type TelemetryEventProperties
} from "@/lib/telemetry/events"

describe("telemetry event contract", () => {
  it("centralizes the foundation event names", () => {
    expect(TELEMETRY_EVENTS).toEqual([
      "app_opened",
      "beta_telemetry_acknowledged",
      "pwa_install_prompt_shown",
      "pwa_installed",
      "app_backgrounded",
      "app_resumed",
      "planner_opened",
      "planner_input_completed",
      "route_plan_requested",
      "route_plan_succeeded",
      "route_plan_failed",
      "route_candidates_presented",
      "route_candidate_selected",
      "route_mode_changed",
      "route_replanned",
      "route_reroute_triggered",
      "route_reroute_completed",
      "route_reroute_failed",
      "route_detail_opened",
      "route_comparison_started",
      "route_comparison_ended",
      "route_explanation_opened",
      "traffic_incident_opened",
      "route_saved",
      "route_shared",
      "navigation_started",
      "route_abandoned",
      "free_ride_opened",
      "free_ride_discovery_started",
      "free_ride_suggestions_presented",
      "free_ride_suggestion_opened",
      "free_ride_suggestion_accepted",
      "free_ride_suggestion_dismissed",
      "free_ride_live_started",
      "free_ride_live_suggestion_shown",
      "free_ride_live_suggestion_accepted",
      "gpx_library_opened",
      "gpx_project_opened",
      "gpx_import_started",
      "gpx_import_succeeded",
      "gpx_import_failed",
      "gpx_route_loaded",
      "gpx_exported",
      "gpx_filter_changed",
      "map_style_changed",
      "map_layer_toggled",
      "map_recenter_used",
      "map_3d_toggled",
      "panel_opened",
      "panel_closed",
      "primary_action_invoked",
      "help_opened",
      "offline_mode_entered",
      "offline_pack_download_started",
      "offline_pack_download_completed",
      "offline_pack_download_failed",
      "offline_route_planned",
      "provider_request_started",
      "provider_request_completed",
      "provider_request_failed",
      "provider_timeout",
      "provider_fallback_used",
      "app_error",
      "workflow_span_completed"
    ])
    expect(isTelemetryEventName("app_opened")).toBe(true)
    expect(isTelemetryEventName("raw_gpx_uploaded")).toBe(false)
  })

  it("keeps acknowledgement properties explicit and categorical", () => {
    const properties: TelemetryEventProperties<"beta_telemetry_acknowledged"> = {
      acknowledgement_version: "2026-09-14.v1",
      acknowledged_at: "2026-09-14T13:00:00.000Z"
    }

    expect(properties.acknowledgement_version).toBe("2026-09-14.v1")
  })

  it("keeps planner result properties bounded to the route summary contract", () => {
    const properties: TelemetryEventProperties<"route_plan_succeeded"> = {
      route_mode: "destination",
      route_source: "manual",
      provider_set: "graphhopper+valhalla",
      distance_band: "25-75mi",
      duration_band: "30-90m",
      detour_band: "10-30m",
      waypoint_count_band: "2-3",
      candidate_count: 2,
      surface_mix_band: "mixed",
      traffic_evidence_present: false,
      success: true,
      latency_ms: 812
    }

    expect(properties.provider_set).toBe("graphhopper+valhalla")
  })
})
