export interface AtlasManifestRoute {
  id: string
}

export interface AtlasManifest {
  routes?: AtlasManifestRoute[]
}

export interface AtlasRouteEntry {
  bbox?: unknown
  duplicateOf?: string
}

export interface AtlasDocument {
  version?: unknown
  count?: unknown
  sourceFingerprint?: unknown
  routes?: Record<string, AtlasRouteEntry>
}

export function atlasSourceFingerprint(
  manifestRaw: string,
  manifestRoutes: readonly AtlasManifestRoute[],
  routeSources: ReadonlyMap<string, string>,
): string

export function atlasIntegrityProblems(args: {
  manifest: AtlasManifest
  atlas: AtlasDocument
  expectedFingerprint: string
}): string[]
