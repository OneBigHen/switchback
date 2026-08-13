import { readServerRuntimeDiagnostics } from "@/lib/server/runtime-diagnostics"

export interface HealthOptions {
  routerBaseUrl: string
  valhallaBaseUrl?: string
  fetcher?: typeof fetch
}

interface ProviderHealth {
  ok: boolean
  status: number
  latencyMs: number
}

async function probeProvider(
  baseUrl: string,
  path: string,
  fetcher: typeof fetch
): Promise<ProviderHealth> {
  const startedAt = performance.now()
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
      headers: { accept: "text/plain, application/json" },
      signal: AbortSignal.timeout(4_000)
    })
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt)
    }
  } catch {
    return {
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - startedAt)
    }
  }
}

export async function getSystemHealth(options: HealthOptions) {
  const fetcher = options.fetcher ?? fetch
  const valhallaBaseUrl = options.valhallaBaseUrl?.trim()
  const [router, valhalla] = await Promise.all([
    probeProvider(options.routerBaseUrl, "/health", fetcher),
    valhallaBaseUrl ? probeProvider(valhallaBaseUrl, "/status", fetcher) : undefined
  ])
  const providers = {
    graphhopper: router,
    ...(valhalla ? { valhalla } : {})
  }
  const degradedProviders = Object.entries(providers)
    .filter(([, provider]) => !provider.ok)
    .map(([name]) => name)

  return {
    ok: router.ok,
    degraded: Boolean(valhalla && !valhalla.ok),
    app: { ok: true },
    router,
    providers,
    degradedProviders,
    runtime: readServerRuntimeDiagnostics()
  }
}
