import type { CaptureResult, CapturedNetworkRequest } from "posthog-js"

const INTERNAL_URL_ORIGIN = "https://opengravel.invalid"
const MAX_STRING_LENGTH = 1_024
const MAX_ARRAY_ITEMS = 100
const MAX_OBJECT_DEPTH = 8
const OMIT = Symbol("omit telemetry value")

const SENSITIVE_KEY_PARTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "credential",
  "webauthn",
  "challenge",
  "assertion",
  "privatekey",
  "apikey",
  "rawgpx",
  "gpx",
  "polyline",
  "geometry",
  "coordinates",
  "latitude",
  "longitude",
  "originlat",
  "originlng",
  "destinationlat",
  "destinationlng",
  "rawgps",
  "gpshistory",
  "privatehistory",
  "usernote",
  "privatenote",
  "uploadedfile",
  "filecontents"
] as const

const SENSITIVE_COORDINATE_KEYS = new Set(["lat", "lng", "lon"])
const PRIVATE_PATH_MARKERS = new Set([
  "route",
  "routes",
  "gpx",
  "gpx-library",
  "project",
  "projects",
  "shared",
  "share",
  "report",
  "reports",
  "revision",
  "revisions",
  "comment",
  "comments",
  "artifact",
  "artifacts"
])

const SENSITIVE_EXACT_KEYS = new Set([
  "exceptionlist",
  "exceptionsteps",
  "exceptionmessage",
  "exceptionstack",
  "exceptionstacktrace",
  "exceptionvalue",
  "errormessage",
  "errorstack",
  "errorstacktrace",
  "message",
  "stack",
  "stacktrace"
])

const SAFE_EXCEPTION_KEYS = new Set([
  "exceptionlist",
  "exceptiontype",
  "exceptionlevel",
  "exceptionhandled",
  "exceptionsource",
  "exceptionfingerprint",
  "exceptionid",
  "exceptionurl"
])

const SENSITIVE_STRING_PATTERNS = [
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+\-/=]{8,}/i,
  /\b(?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /[-+]?\d{1,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}/
]

/** Exact names passed to PostHog's native denylist in addition to the
 * recursive, normalized-key scrubber below. */
export const SENSITIVE_TELEMETRY_PROPERTY_DENYLIST = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "credential",
  "webauthn",
  "challenge",
  "assertion",
  "private_key",
  "api_key",
  "raw_gpx",
  "polyline",
  "geometry",
  "coordinates",
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "origin_lat",
  "origin_lng",
  "destination_lat",
  "destination_lng"
] as const

const URL_KEY_PARTS = ["url", "href", "referrer", "endpoint", "path", "pathname"] as const

export function normalizeTelemetryKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function isSensitiveTelemetryKey(key: string): boolean {
  const normalized = normalizeTelemetryKey(key)
  return SENSITIVE_EXACT_KEYS.has(normalized)
    || SENSITIVE_COORDINATE_KEYS.has(normalized)
    || SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

function isUrlKey(key: string): boolean {
  const normalized = normalizeTelemetryKey(key)
  return URL_KEY_PARTS.some((part) => normalized.includes(part))
}

function normalizePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return "/"

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]?.toLowerCase()
    if (previous === "shared" || previous === "share") segments[index] = "[token]"
    else if (previous === "gpx" || previous === "gpx-library" || previous === "project" || previous === "projects") segments[index] = "[project]"
    else if (PRIVATE_PATH_MARKERS.has(previous ?? "")) segments[index] = "[id]"
  }

  return `/${segments.map((segment) => {
    if (segment === "[id]" || segment === "[project]" || segment === "[token]") return segment
    if (/^[0-9a-f]{16,}$/i.test(segment) || /^[0-9a-f-]{20,}$/i.test(segment)) return "[id]"
    if (/^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?)+$/.test(segment)) return "[value]"
    return segment
  }).join("/")}`
}

/**
 * Return an origin plus a route template for absolute URLs, or a route
 * template for relative URLs. Query strings and fragments are never useful
 * to the product questions this boundary supports and may carry secrets.
 */
export function sanitizeTelemetryUrl(value: string): string | null {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("data:")) return null
  try {
    const parsed = new URL(value, INTERNAL_URL_ORIGIN)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    const path = normalizePath(parsed.pathname)
    return parsed.origin === INTERNAL_URL_ORIGIN ? path : `${parsed.origin}${path}`
  } catch {
    return null
  }
}

function safeString(value: string): string | typeof OMIT {
  if (value.length > MAX_STRING_LENGTH) return OMIT
  if (/<\/?(?:gpx|trk|trkseg|wpt)\b|<\?xml|BEGIN (?:OPENSSH|PRIVATE KEY)/i.test(value)) return OMIT
  if (SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value))) return OMIT
  return value
}

function safeExceptionIdentifier(value: unknown, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback
  const candidate = value.trim()
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate) ? candidate : fallback
}

function safeExceptionList(value: unknown): Array<{ type: string }> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 5).map((entry) => {
    const type = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>).type
      : undefined
    return { type: safeExceptionIdentifier(type, "Exception") }
  })
}

function containsNumericArray(value: unknown, seen = new Set<object>()): boolean {
  if (!Array.isArray(value) || seen.has(value)) return false
  seen.add(value)
  if (value.length >= 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))) return true
  return value.some((item) => containsNumericArray(item, seen))
}

function isCoordinateObject(value: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(value).map(normalizeTelemetryKey))
  return ((keys.has("lat") || keys.has("latitude")) && (keys.has("lng") || keys.has("lon") || keys.has("longitude")))
    || (keys.has("x") && keys.has("y"))
}

function sanitizeValue(value: unknown, depth: number, seen: Set<object>): unknown {
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "string") return safeString(value)
  if (typeof value === "number") return Number.isFinite(value) ? value : OMIT
  if (depth >= MAX_OBJECT_DEPTH || typeof value !== "object") return OMIT
  if (seen.has(value)) return OMIT
  if (Array.isArray(value) && containsNumericArray(value)) return OMIT
  if (!Array.isArray(value) && isCoordinateObject(value as Record<string, unknown>)) return OMIT

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const result = value.slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, depth + 1, seen))
        .filter((item) => item !== OMIT)
      return result
    }

    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveTelemetryKey(key)) continue
      const normalizedKey = normalizeTelemetryKey(key)
      const sanitized = normalizedKey === "exceptiontype"
        ? safeExceptionIdentifier(item, "Exception")
        : normalizedKey === "exceptionhandled" && typeof item === "boolean"
          ? item
          : ["exceptionlevel", "exceptionsource", "exceptionfingerprint", "exceptionid"].includes(normalizedKey)
            ? safeExceptionIdentifier(item)
            : isUrlKey(key) && typeof item === "string"
              ? sanitizeTelemetryUrl(item)
              : sanitizeValue(item, depth + 1, seen)
      if (sanitized !== OMIT && sanitized !== undefined) result[key] = sanitized
    }
    return Object.keys(result).length > 0 ? result : OMIT
  } finally {
    seen.delete(value)
  }
}

export function sanitizeTelemetryProperties(
  properties: object
): Record<string, unknown> {
  const sanitized = sanitizeValue(properties, 0, new Set<object>())
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {}
}

export function sanitizeCaptureResult(
  capture: CaptureResult | null,
  postHogProjectToken?: string
): CaptureResult | null {
  if (!capture) return null
  const properties = sanitizeTelemetryProperties(capture.properties)
  if (capture.event === "$exception") {
    const exceptionList = safeExceptionList(capture.properties.$exception_list)
    if (exceptionList.length > 0) properties.$exception_list = exceptionList
    for (const key of Object.keys(properties)) {
      const normalizedKey = normalizeTelemetryKey(key)
      if (normalizedKey.startsWith("exception") && !SAFE_EXCEPTION_KEYS.has(normalizedKey)) {
        delete properties[key]
      }
    }
  }
  // PostHog adds its project token to every event as the transport api_key.
  // The native denylist removes that protocol field before before_send, so add
  // back only the configured public project token. Arbitrary user properties
  // named token remain removed by sanitizeTelemetryProperties.
  if (postHogProjectToken) properties.token = postHogProjectToken
  return {
    ...capture,
    properties,
    ...(capture.$set ? { $set: sanitizeTelemetryProperties(capture.$set) } : {}),
    ...(capture.$set_once ? { $set_once: sanitizeTelemetryProperties(capture.$set_once) } : {})
  }
}

/**
 * PostHog's replay API supplies this hook before network metadata enters a
 * recording. Keep timing/status fields, normalize the URL, and omit all
 * headers and bodies even if a project-level replay override is too broad.
 */
export function sanitizeCapturedNetworkRequest(
  request: CapturedNetworkRequest
): CapturedNetworkRequest | null {
  const name = sanitizeTelemetryUrl(request.name)
  if (!name) return null
  const safe = { ...request, name }
  delete safe.requestHeaders
  delete safe.responseHeaders
  delete safe.requestBody
  delete safe.responseBody
  return safe
}
