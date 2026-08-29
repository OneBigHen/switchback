import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { sanitizePlainText } from "@/lib/community/contracts"
import { getIdentityRuntime, type IdentityRuntime } from "@/app/api/identity/context"
import { getSessionConfigurationStatus } from "@/lib/identity/passkey"
import { WebAuthnConfigError } from "@/lib/identity/webauthn"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 5, label: "passkey registration request" })

function displayName(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null
  const value = (body as Record<string, unknown>).displayName
  return typeof value === "string" ? sanitizePlainText(value, 80) || null : null
}

export async function handleIdentityRegistrationOptions(
  request: Request,
  runtime: IdentityRuntime = getIdentityRuntime()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const sessionConfiguration = getSessionConfigurationStatus()
    if (!sessionConfiguration.ok) {
      return apiErrorResponse("IDENTITY_CONFIGURATION_MISSING", "Switchback ID is not configured on this server. Ask the operator to set SWITCHBACK_SESSION_SECRET.", 503, requestId)
    }
    const body = await readBoundedJsonBody(request, 8 * 1024)
    const identityId = runtime.store.createIdentity(displayName(body))
    const challenge = runtime.challenges.issue("registration", identityId)
    const options = await runtime.verifier.generateRegistrationOptions({
      rpName: runtime.config.rpName,
      rpID: runtime.config.rpID,
      userName: identityId,
      userDisplayName: displayName(body) ?? "Switchback rider",
      challenge: challenge.challenge,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required"
      }
    })
    return jsonWithRequestId({ challengeId: challenge.id, options }, requestId)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That passkey request is too large.", 413, requestId)
    if (caught instanceof WebAuthnConfigError) return apiErrorResponse("IDENTITY_CONFIGURATION_MISSING", "Switchback ID is not configured on this server. Ask the operator to set its WebAuthn and session configuration.", 503, requestId)
    return apiErrorResponse("INVALID_PASSKEY_OPTIONS", "Passkey registration could not start.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleIdentityRegistrationOptions)
