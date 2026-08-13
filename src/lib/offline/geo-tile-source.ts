import type { OfflineBounds, OfflineGraphTileV2 } from "./v2-contracts"

/** Content-addressed tile metadata exposed by an installed region. */
export interface OfflineGraphTileReference {
  regionId: string
  version: string
  tileId: string
  bounds: OfflineBounds
  bytes: number
  sha256: string
}

/** Lazy tile source used by the browser Geo Worker client. */
export interface OfflineGraphTileSource {
  listActiveTileReferences(
    regionId: string,
    searchBounds?: OfflineBounds
  ): Promise<OfflineGraphTileReference[]>
  loadActiveTile(regionId: string, tileId: string): Promise<OfflineGraphTileV2>
}
