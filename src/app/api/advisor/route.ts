import {
  array, enum_, number, object_, optional, safeParse, string, tuple
} from "@/lib/validate"
import { createAdviserFromEnvironment, resolveAdvisorCapability } from "@/lib/advice/capability"
import { emptyReply, type AdviceRequest } from "@/lib/advice/contracts"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The advisor turn endpoint.
 *
 * Stateless: the client owns the transcript and posts it back, so nothing about
 * a rider's conversation is stored server-side. When the capability is absent
 * (no `GEMINI_API_KEY`) this answers `disabled` rather than 404, so the
 * client can hide the surface without probing for keys.
 *
 * Rate limits are tight on purpose — every turn costs money and the advisor is
 * never on the planning critical path.
 */

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 8, label: "advisor turn" })

const MAX_BODY_BYTES = 24 * 1024

const PROFILES = [
  "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
] as const

const coordinateSchema = tuple([
  number({ finite: true, min: -180, max: 180 }),
  number({ finite: true, min: -90, max: 90 })
])

const candidateSchema = object_({
  id: string({ trim: true, min: 1, max: 120 }),
  name: string({ trim: true, min: 1, max: 160 }),
  profile: enum_(PROFILES),
  distanceMiles: number({ finite: true, min: 0, max: 20_000 }),
  durationMinutes: number({ finite: true, min: 0, max: 100_000 }),
  twistiness: number({ finite: true, min: 0, max: 100 }),
  turnCount: number({ finite: true, min: 0, max: 100_000 }),
  roadMix: optional(object_({}, { passthrough: true })),
  surfaceMix: optional(object_({}, { passthrough: true }))
}, { passthrough: true })

const payloadSchema = object_({
  // Absent while the rider is building a ride from scratch and the advisor is
  // helping put one together.
  context: optional(object_({
    selectedRouteId: string({ trim: true, min: 1, max: 120 }),
    candidates: array(candidateSchema, { min: 1, max: 6 }),
    geometry: array(coordinateSchema, { min: 2, max: 64 }),
    warnings: optional(array(string({ trim: true, max: 400 }), { max: 8 }))
  })),
  origin: optional(object_({
    lat: number({ finite: true, min: -90, max: 90 }),
    lon: number({ finite: true, min: -180, max: 180 }),
    label: optional(string({ trim: true, max: 160 }))
  })),
  conversation: optional(array(object_({
    role: enum_(["rider", "advisor"] as const),
    text: string({ trim: true, min: 1, max: 2_000 })
  }), { max: 12 })),
  riderMessage: optional(string({ trim: true, min: 1, max: 1_000 }))
})

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status })
}

export async function handleAdvisorPost(request: Request): Promise<Response> {
  const capability = resolveAdvisorCapability(process.env)
  if (!capability.enabled) {
    // Not an error: this deployment simply does not have the capability.
    return Response.json({ ...emptyReply("disabled"), capability })
  }

  let body: unknown
  try {
    body = await readBoundedJsonBody(request, MAX_BODY_BYTES)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) {
      return jsonError("ADVISOR_REQUEST_TOO_LARGE", "That ride is too large to discuss.", 413)
    }
    return jsonError("INVALID_ADVISOR_REQUEST", "The advisor request must be valid JSON.", 400)
  }

  const parsed = safeParse(payloadSchema, body)
  if (!parsed.success) {
    return jsonError("INVALID_ADVISOR_REQUEST", "Send the current route and candidates.", 400)
  }

  const adviser = createAdviserFromEnvironment(process.env)
  if (!adviser) return Response.json({ ...emptyReply("no-key"), capability })

  const context = parsed.data.context
  const input: AdviceRequest = {
    context: context
      ? {
          selectedRouteId: context.selectedRouteId,
          candidates: context.candidates as NonNullable<AdviceRequest["context"]>["candidates"],
          geometry: context.geometry,
          warnings: context.warnings ?? []
        }
      : null,
    conversation: parsed.data.conversation ?? [],
    ...(parsed.data.riderMessage ? { riderMessage: parsed.data.riderMessage } : {}),
    ...(parsed.data.origin ? { origin: parsed.data.origin } : {})
  }

  const reply = await adviser.advise(input, request.signal)
  return Response.json({ ...reply, capability })
}

export const POST = withRateLimit(requestLimiter, handleAdvisorPost)

// Lets the client learn whether the surface exists without spending a turn.
export function GET(): Response {
  return Response.json({ capability: resolveAdvisorCapability(process.env) })
}
