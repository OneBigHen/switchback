import { handleRideIntentRequest } from "./handler"
import { interpretRidePrompt } from "@/lib/ai/ride-intent"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const runtime = "nodejs"

// OpenRouter calls can cost money (depending on OPENROUTER_MODEL); the
// request-level limiter stops a public caller from draining the key.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "ride interpretation" })

async function handleRideIntentPost(request: Request): Promise<Response> {
  return handleRideIntentRequest(request, (prompt) => interpretRidePrompt(prompt, {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL ?? "openrouter/free"
  }))
}

export const POST = withRateLimit(requestLimiter, handleRideIntentPost)
