import { apiErrorResponse, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { createIdentitySessionResponse } from "@/lib/identity/csrf"
import { getIdentityRuntime, type IdentityRuntime } from "@/app/api/identity/context"
import type { RegistrationResponseJSON } from "@/lib/identity/webauthn"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "passkey verification request" })

export async function handleIdentityRegistrationVerify(
  request: Request,
  runtime: IdentityRuntime = getIdentityRuntime()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const body = await readBoundedJsonBody(request, 64 * 1024)
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("invalid body")
    const value = body as Record<string, unknown>
    if (typeof value.challengeId !== "string" || typeof value.response !== "object" || value.response === null || Array.isArray(value.response)) {
      throw new Error("invalid passkey response")
    }
    const challenge = runtime.challenges.consume(value.challengeId, "registration")
    if (!challenge?.identityId) return apiErrorResponse("PASSKEY_CHALLENGE_INVALID", "That passkey challenge is expired or already used.", 400, requestId)
    const result = await runtime.verifier.verifyRegistrationResponse({
      response: value.response as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: runtime.config.expectedOrigin,
      expectedRPID: runtime.config.rpID,
      requireUserPresence: true,
      requireUserVerification: true
    })
    const registrationInfo = result.registrationInfo
    if (!result.verified || !registrationInfo) return apiErrorResponse("PASSKEY_VERIFICATION_FAILED", "The passkey response could not be verified.", 400, requestId)
    try {
      runtime.store.registerPasskeyCredential({
        credentialId: registrationInfo.credential.id,
        identityId: challenge.identityId,
        publicKey: registrationInfo.credential.publicKey,
        signCount: registrationInfo.credential.counter
      })
    } catch (caught) {
      if (caught instanceof Error && /unique|constraint/i.test(caught.message)) {
        return apiErrorResponse("PASSKEY_CREDENTIAL_EXISTS", "That passkey is already registered.", 409, requestId)
      }
      throw caught
    }
    return withRequestId(createIdentitySessionResponse(challenge.identityId), requestId)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That passkey response is too large.", 413, requestId)
    if (caught instanceof Error && /^PASSKEY_/.test(caught.message)) return apiErrorResponse(caught.message, "The passkey response could not be verified.", 400, requestId)
    return apiErrorResponse("PASSKEY_VERIFICATION_FAILED", "The passkey response could not be verified.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleIdentityRegistrationVerify)
