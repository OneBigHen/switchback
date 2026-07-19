export function browserRequestSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined") return undefined
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(timeoutMs)
  if (typeof AbortController === "undefined") return undefined

  const controller = new AbortController()
  globalThis.setTimeout(() => controller.abort(), timeoutMs)
  return controller.signal
}
