export interface HealthOptions {
  routerBaseUrl: string
  fetcher?: typeof fetch
}

export async function getSystemHealth(_options: HealthOptions) {
  const startedAt = performance.now()
  try {
    const response = await (_options.fetcher ?? fetch)(
      `${_options.routerBaseUrl.replace(/\/$/, "")}/health`,
      {
        headers: { accept: "text/plain, application/json" },
        signal: AbortSignal.timeout(4_000)
      }
    )
    const router = {
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt)
    }
    return { ok: router.ok, app: { ok: true }, router }
  } catch {
    return {
      ok: false,
      app: { ok: true },
      router: {
        ok: false,
        status: 0,
        latencyMs: Math.round(performance.now() - startedAt)
      }
    }
  }
}
