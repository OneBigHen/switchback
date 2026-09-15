import type { WorkflowSpanProperties } from "./spans"

export const TELEMETRY_EVENTS = [
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
] as const

export type TelemetryEventName = typeof TELEMETRY_EVENTS[number]

export type TelemetrySurface = "plan" | "explore" | "saved" | "settings" | "ride" | "free-ride" | "unknown"

export type TelemetryRouteMode = "destination" | "loop" | "unknown"
export type TelemetryRouteSource = "manual" | "intent" | "replan" | "offline-recovery" | "free-ride" | "unknown"
export type TelemetryProvider = "graphhopper" | "valhalla" | "regional-offline" | "offline-pack" | "unknown"
export type TelemetryProviderSet = "graphhopper" | "valhalla" | "graphhopper+valhalla" | "unknown"
export type TelemetryCandidateRole =
  | "fastest"
  | "best-ride"
  | "quick"
  | "balanced"
  | "twisty"
  | "scenic"
  | "adventure"
  | "gravel"
  | "avoid-highways"
  | "neural"
  | "better-roads"
  | "leaner"
  | "imported-track"
  | "unknown"
export type TelemetryDistanceBand = "0-25mi" | "25-75mi" | "75-150mi" | "150+mi" | "unknown"
export type TelemetryDurationBand = "0-30m" | "30-90m" | "90-180m" | "180-360m" | "360m+" | "unknown"
export type TelemetryDetourBand = "none" | "0-10m" | "10-30m" | "30m+" | "unknown"
export type TelemetryCountBand = "0" | "1" | "2-3" | "4+" | "unknown"
export type TelemetrySurfaceMixBand = "mostly-paved" | "mixed" | "mostly-unpaved" | "unknown"
export type TelemetryLatencyBand = "0-1s" | "1-3s" | "3-10s" | "10s+" | "unknown"
export type TelemetryFailureClass =
  | "missing-input"
  | "provider-unavailable"
  | "provider-timeout"
  | "provider-failure"
  | "invalid-response"
  | "no-route"
  | "cancelled"
  | "storage-failure"
  | "parse-failure"
  | "unknown"
export type TelemetryProviderOperation =
  | "route-plan-primary"
  | "route-plan-alternatives"
  | "reroute"
  | "gpx-road-match"
  | "offline-route-plan"
  | "unknown"
export type TelemetryGpxSourceClass = "imported-file" | "recorded-ride" | "catalog" | "saved-route" | "unknown"
export type TelemetryGpxFormat = "gpx" | "kml" | "kmz" | "unknown"
export type TelemetryFileSizeBand = "0-100kb" | "100kb-1mb" | "1-5mb" | "5mb+" | "unknown"
export type TelemetryGpxExportVariant = "track" | "track-waypoints" | "cues" | "route" | "original" | "recorded" | "unknown"
export type TelemetryGpxFilterKind = "query" | "quick-chip" | "sort" | "radius" | "length" | "difficulty" | "region" | "area" | "reset" | "unknown"
export type TelemetryPanel = "route-details" | "downloads" | "profile" | "settings" | "record" | "help" | "unknown"
export type TelemetryMapStyle = "standard" | "terrain" | "satellite" | "unknown"
export type TelemetryMapLayer = "curvature" | "unpaved" | "traffic" | "closures" | "road-controls" | "gravel-atlas" | "unknown"
export type TelemetryMapControl = "style" | "layer" | "recenter" | "3d" | "unknown"
export type TelemetryOfflineReason = "browser-offline" | "manual" | "no-network" | "unknown"
export type TelemetryFreeRideMode = "discovery" | "live" | "unknown"
export type TelemetrySuggestionOutcome = "accepted" | "dismissed" | "less-like-this" | "expired" | "unknown"
export type TelemetryRerouteReason = "off-route" | "road-closure" | "rider-edit" | "provider-recovery" | "unknown"
export type TelemetryErrorSurface = TelemetrySurface | "planner" | "provider" | "offline" | "gpx" | "unknown"

/** Shared, deliberately aggregate dimensions for planner and route events. */
export interface TelemetryRouteProperties {
  route_mode?: TelemetryRouteMode
  route_source?: TelemetryRouteSource
  provider_set?: TelemetryProviderSet
  provider_role?: TelemetryProvider
  distance_band?: TelemetryDistanceBand
  duration_band?: TelemetryDurationBand
  detour_band?: TelemetryDetourBand
  waypoint_count_band?: TelemetryCountBand
  candidate_count?: number
  surface_mix_band?: TelemetrySurfaceMixBand
  traffic_evidence_present?: boolean
  success?: boolean
  failure_class?: TelemetryFailureClass
  latency_ms?: number
  latency_band?: TelemetryLatencyBand
  selected_candidate_role?: TelemetryCandidateRole
}

export interface TelemetryPlannerInputProperties extends TelemetryRouteProperties {
  surface?: TelemetrySurface
  completion_method?: "text" | "map" | "saved" | "current-location" | "sketch" | "unknown"
}

export interface TelemetryRerouteProperties extends TelemetryRouteProperties {
  reroute_reason?: TelemetryRerouteReason
}

export interface TelemetryRouteDecisionProperties extends TelemetryRouteProperties {
  comparison_outcome?: "selected" | "backed-out" | "abandoned" | "unknown"
  explanation_type?: "score" | "directions" | "surface" | "traffic" | "preparation" | "unknown"
  navigation_started?: boolean
}

export interface TelemetryFreeRideProperties extends TelemetryRouteProperties {
  free_ride_mode?: TelemetryFreeRideMode
  suggestion_count?: number
  suggestion_outcome?: TelemetrySuggestionOutcome
  suppression_reason?: "gps-uncertain" | "high-workload" | "cooldown" | "no-safe-candidate" | "unknown"
}

export interface TelemetryGpxProperties extends TelemetryRouteProperties {
  source_class?: TelemetryGpxSourceClass
  format?: TelemetryGpxFormat
  export_variant?: TelemetryGpxExportVariant
  file_size_band?: TelemetryFileSizeBand
  point_count_band?: TelemetryCountBand
  route_count_band?: TelemetryCountBand
  parse_duration_ms?: number
  filter_kind?: TelemetryGpxFilterKind
  filter_state?: "applied" | "cleared" | "unknown"
  active_filter_count?: number
}

export interface TelemetryMapProperties {
  surface?: TelemetrySurface
  control?: TelemetryMapControl
  map_style?: TelemetryMapStyle
  layer?: TelemetryMapLayer
  enabled?: boolean
}

export interface TelemetryOfflineProperties extends TelemetryRouteProperties {
  offline_reason?: TelemetryOfflineReason
  region_count_band?: TelemetryCountBand
  pack_size_band?: TelemetryFileSizeBand
}

export interface TelemetryProviderProperties extends TelemetryRouteProperties {
  operation?: TelemetryProviderOperation
  provider?: TelemetryProvider
  fallback_from?: TelemetryProvider
  fallback_to?: TelemetryProvider
}

export interface TelemetryErrorProperties {
  error_class: TelemetryFailureClass
  feature: "planner" | "route" | "free-ride" | "gpx" | "offline" | "provider" | "navigation" | "unknown"
  surface: TelemetryErrorSurface
  recoverable: boolean
  recovery_path?: "retry" | "fallback" | "edit-input" | "continue-offline" | "none" | "unknown"
  user_impact: "blocked" | "degraded" | "advisory" | "none" | "unknown"
}

export interface TelemetryEventPropertiesMap {
  app_opened: {
    entry_surface: TelemetrySurface
  }
  beta_telemetry_acknowledged: {
    acknowledgement_version: string
    acknowledged_at: string
  }
  app_backgrounded: {
    foreground_duration_ms?: number
  }
  app_resumed: {
    background_duration_ms?: number
  }
  pwa_install_prompt_shown: {
    surface?: TelemetrySurface
  }
  pwa_installed: {
    surface?: TelemetrySurface
  }
  planner_opened: TelemetryPlannerInputProperties
  planner_input_completed: TelemetryPlannerInputProperties
  route_plan_requested: TelemetryPlannerInputProperties
  route_plan_succeeded: TelemetryRouteProperties
  route_plan_failed: TelemetryRouteProperties
  route_candidates_presented: TelemetryRouteProperties
  route_candidate_selected: TelemetryRouteProperties
  route_mode_changed: TelemetryPlannerInputProperties
  route_replanned: TelemetryRerouteProperties
  route_reroute_triggered: TelemetryRerouteProperties
  route_reroute_completed: TelemetryRerouteProperties
  route_reroute_failed: TelemetryRerouteProperties
  route_detail_opened: TelemetryRouteDecisionProperties
  route_comparison_started: TelemetryRouteDecisionProperties
  route_comparison_ended: TelemetryRouteDecisionProperties
  route_explanation_opened: TelemetryRouteDecisionProperties
  traffic_incident_opened: TelemetryRouteDecisionProperties
  route_saved: TelemetryRouteDecisionProperties
  route_shared: TelemetryRouteDecisionProperties
  navigation_started: TelemetryRouteDecisionProperties
  route_abandoned: TelemetryRouteDecisionProperties
  free_ride_opened: TelemetryFreeRideProperties
  free_ride_discovery_started: TelemetryFreeRideProperties
  free_ride_suggestions_presented: TelemetryFreeRideProperties
  free_ride_suggestion_opened: TelemetryFreeRideProperties
  free_ride_suggestion_accepted: TelemetryFreeRideProperties
  free_ride_suggestion_dismissed: TelemetryFreeRideProperties
  free_ride_live_started: TelemetryFreeRideProperties
  free_ride_live_suggestion_shown: TelemetryFreeRideProperties
  free_ride_live_suggestion_accepted: TelemetryFreeRideProperties
  gpx_library_opened: TelemetryGpxProperties
  gpx_project_opened: TelemetryGpxProperties
  gpx_import_started: TelemetryGpxProperties
  gpx_import_succeeded: TelemetryGpxProperties
  gpx_import_failed: TelemetryGpxProperties
  gpx_route_loaded: TelemetryGpxProperties
  gpx_exported: TelemetryGpxProperties
  gpx_filter_changed: TelemetryGpxProperties
  map_style_changed: TelemetryMapProperties
  map_layer_toggled: TelemetryMapProperties
  map_recenter_used: TelemetryMapProperties
  map_3d_toggled: TelemetryMapProperties
  panel_opened: TelemetryMapProperties & { panel?: TelemetryPanel }
  panel_closed: TelemetryMapProperties & { panel?: TelemetryPanel }
  primary_action_invoked: TelemetryMapProperties & { action?: "plan" | "start-ride" | "free-ride" | "save" | "share" | "export" | "unknown" }
  help_opened: TelemetryMapProperties & { topic?: "planner" | "offline" | "gpx" | "navigation" | "privacy" | "unknown" }
  offline_mode_entered: TelemetryOfflineProperties
  offline_pack_download_started: TelemetryOfflineProperties
  offline_pack_download_completed: TelemetryOfflineProperties
  offline_pack_download_failed: TelemetryOfflineProperties
  offline_route_planned: TelemetryOfflineProperties
  provider_request_started: TelemetryProviderProperties
  provider_request_completed: TelemetryProviderProperties
  provider_request_failed: TelemetryProviderProperties
  provider_timeout: TelemetryProviderProperties
  provider_fallback_used: TelemetryProviderProperties
  app_error: TelemetryErrorProperties
  workflow_span_completed: WorkflowSpanProperties
}

export type TelemetryEventProperties<EventName extends TelemetryEventName> =
  TelemetryEventPropertiesMap[EventName]

export function isTelemetryEventName(value: string): value is TelemetryEventName {
  return (TELEMETRY_EVENTS as readonly string[]).includes(value)
}
