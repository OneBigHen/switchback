import { handleRideIntentRequest } from "./handler"
import { interpretRidePrompt } from "@/lib/ai/ride-intent"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return handleRideIntentRequest(request, (prompt) => interpretRidePrompt(prompt, {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL ?? "openrouter/free"
  }))
}
