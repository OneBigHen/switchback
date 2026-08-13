import type { ServerRuntimeDiagnostics } from "@/lib/domain/diagnostics"

type RouteRuntimeProbe = () => Pick<
  ServerRuntimeDiagnostics,
  "routeRunningJobs" | "routeQueuedJobs" | "routeCacheEntries"
>

let routeProbe: RouteRuntimeProbe | null = null

/** Register optional route counters without making health depend on routes. */
export function setRouteRuntimeProbe(probe: RouteRuntimeProbe | null): () => void {
  routeProbe = probe
  return () => {
    if (routeProbe === probe) routeProbe = null
  }
}
export function readServerRuntimeDiagnostics(): ServerRuntimeDiagnostics {
  const memory = process.memoryUsage()
  const route = routeProbe?.() ?? {
    routeRunningJobs: null,
    routeQueuedJobs: null,
    routeCacheEntries: null
  }
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
    ...route
  }
}
