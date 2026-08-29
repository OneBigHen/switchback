import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { getIdentityRuntime, type IdentityRuntime } from "@/app/api/identity/context"
import { getSessionConfigurationStatus } from "@/lib/identity/passkey"
import { WebAuthnConfigError } from "@/lib/identity/webauthn"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "passkey authentication request" })

export async function handleIdentityAuthenticationOptions(
  request: Request,
  runtime: IdentityRuntime = getIdentityRuntime()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const sessionConfiguration = getSessionConfigurationStatus()
    if (!sessionConfiguration.ok) {
      return apiErrorResponse("IDENTITY_CONFIGURATION_MISSING", "Switchback ID is not configured on this server. Ask the operator to set SWITCHBACK_SESSION_SECRET.", 503, requestId)
    }
    const challenge = runtime.challenges.issue("authentication")
    const options = await runtime.verifier.generateAuthenticationOptions({
      rpID: runtime.config.rpID,
      challenge: challenge.challenge,
      userVerification: "required"
    })
    return jsonWithRequestId({ challengeId: challenge.id, options }, requestId)
  } catch (caught) {
    if (caught instanceof WebAuthnConfigError) return apiErrorResponse("IDENTITY_CONFIGURATION_MISSING", "Switchback ID is not configured on this server. Ask the operator to set its WebAuthn and session configuration.", 503, requestId)
    return apiErrorResponse("INVALID_PASSKEY_OPTIONS", "Passkey authentication could not start.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleIdentityAuthenticationOptions)
