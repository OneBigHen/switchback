import { getSessionConfigurationStatus } from "@/lib/identity/passkey"
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
  const identity = getSessionConfigurationStatus()
  const configurationIssues = identity.ok || !identity.code ? [] : [identity.code]

  return {
    ok: router.ok && identity.ok,
    degraded: Boolean(valhalla && !valhalla.ok) || !identity.ok,
    app: { ok: true },
    identity,
    configurationIssues,
    router,
    providers,
    degradedProviders,
    runtime: readServerRuntimeDiagnostics()
  }
}
