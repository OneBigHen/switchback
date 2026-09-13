import type { AtlasBrowseRoute } from "./atlas-browse"

/**
 * The browse catalog as it travels to the browser: the rows plus the facet
 * values and totals the discovery header needs.
 *
 * This lives beside `atlas-browse.ts` rather than in the loader that reads it
 * off disk. A client component importing the *type* from the loader is enough
 * to pull `node:fs` into the browser graph, and the build fails with a
 * chunking error that says nothing about which import caused it.
 */
export interface BrowseCatalog {
  routes: AtlasBrowseRoute[]
  regions: string[]
  ridingAreas: string[]
  routeCount: number
  totalMiles: number
  updatedLabel: string | null
}
