/** Browser fixture for the exact envelope returned by app/api/health. */
export const CANONICAL_HEALTH_RESPONSE = {
  ok: true,
  degraded: false,
  app: { ok: true },
  router: { ok: true, status: 200, latencyMs: 1 },
  providers: {
    graphhopper: { ok: true, status: 200, latencyMs: 1 }
  },
  degradedProviders: [],
  runtime: {
    rssBytes: null,
    heapUsedBytes: null,
    heapTotalBytes: null,
    externalBytes: null,
    arrayBuffersBytes: null,
    routeRunningJobs: null,
    routeQueuedJobs: null,
    routeCacheEntries: null
  }
} as const
