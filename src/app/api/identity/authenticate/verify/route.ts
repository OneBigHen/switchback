import { apiErrorResponse, readRequestId, withRequestId } from "@/lib/server/api-contract"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { createIdentitySessionResponse } from "@/lib/identity/csrf"
import { nextPasskeyCounter } from "@/lib/identity/passkey"
import { getIdentityRuntime, type IdentityRuntime } from "@/app/api/identity/context"
import type { AuthenticationResponseJSON } from "@/lib/identity/webauthn"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "passkey authentication verification request" })

export async function handleIdentityAuthenticationVerify(
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
    const response = value.response as Record<string, unknown>
    const challenge = runtime.challenges.consume(value.challengeId, "authentication")
    if (!challenge) return apiErrorResponse("PASSKEY_CHALLENGE_INVALID", "That passkey challenge is expired or already used.", 400, requestId)
    if (typeof response.id !== "string") return apiErrorResponse("PASSKEY_VERIFICATION_FAILED", "The passkey response could not be verified.", 400, requestId)
    const credential = runtime.store.getPasskeyCredential(response.id)
    if (!credential) return apiErrorResponse("PASSKEY_CREDENTIAL_UNKNOWN", "That passkey is not registered on this Switchback instance.", 400, requestId)
    const result = await runtime.verifier.verifyAuthenticationResponse({
      response: value.response as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: runtime.config.expectedOrigin,
      expectedRPID: runtime.config.rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.signCount
      },
      requireUserVerification: true
    })
    if (!result.verified || !result.authenticationInfo) return apiErrorResponse("PASSKEY_VERIFICATION_FAILED", "The passkey response could not be verified.", 400, requestId)
    let counter: number
    try {
      counter = nextPasskeyCounter(credential.signCount, result.authenticationInfo.newCounter)
    } catch {
      return apiErrorResponse("PASSKEY_COUNTER_INVALID", "The passkey counter was invalid or replayed.", 400, requestId)
    }
    runtime.store.updatePasskeyCounter(credential.credentialId, counter)
    return withRequestId(createIdentitySessionResponse(credential.identityId), requestId)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return apiErrorResponse("REQUEST_TOO_LARGE", "That passkey response is too large.", 413, requestId)
    return apiErrorResponse("PASSKEY_VERIFICATION_FAILED", "The passkey response could not be verified.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleIdentityAuthenticationVerify)
