import { apiErrorResponse, jsonWithRequestId, readRequestId } from "@/lib/server/api-contract"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { getIdentityRuntime, type IdentityRuntime } from "@/app/api/identity/context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "passkey authentication request" })

export async function handleIdentityAuthenticationOptions(
  request: Request,
  runtime: IdentityRuntime = getIdentityRuntime()
): Promise<Response> {
  const requestId = readRequestId(request)
  try {
    const challenge = runtime.challenges.issue("authentication")
    const options = await runtime.verifier.generateAuthenticationOptions({
      rpID: runtime.config.rpID,
      challenge: challenge.challenge,
      userVerification: "required"
    })
    return jsonWithRequestId({ challengeId: challenge.id, options }, requestId)
  } catch {
    return apiErrorResponse("INVALID_PASSKEY_OPTIONS", "Passkey authentication could not start.", 400, requestId)
  }
}

export const POST = withRateLimit(requestLimiter, handleIdentityAuthenticationOptions)
