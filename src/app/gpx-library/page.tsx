import type { Metadata } from "next"
import Link from "next/link"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import { AppNavigationLinks } from "@/components/shell/AppNavigationLinks"
import { AtlasBrowser } from "./AtlasBrowser"
import { loadBrowseCatalog } from "./load-catalog"

export const dynamic = "force-dynamic"

const ROUTE_LIBRARY_LEDE = "Find roads worth riding — browse the shared collection by what is near you, how long you want to ride, and how twisty you want it."

export const metadata: Metadata = {
  title: `Explore routes — ${PRODUCT_BRAND.name}`,
  description: ROUTE_LIBRARY_LEDE
}

export default async function GpxLibraryAtlasPage() {
  if (await isAtlasPageOverBudget()) {
    return (
      <main className="atlas-page">
        <nav className="atlas-context" aria-label="Explore routes context">
          <Link href="/">Back to planner</Link>
          <span aria-current="page">Explore routes</span>
        </nav>
        <p className="atlas-empty">
          <strong>Too many route requests from this address.</strong>
          <span>Give it a minute and reload.</span>
        </p>
      </main>
    )
  }

  const catalog = await loadBrowseCatalog()

  return (
    <main className="atlas-page atlas-page--discovery">
      {catalog.routes.length === 0 ? (
        <>
          <nav className="atlas-context" aria-label="Explore routes context">
            <Link href="/">Back to planner</Link>
            <span aria-current="page">Explore routes</span>
          </nav>
          {/* Riders read this page; how an operator fills the library belongs
              in docs/, not in the empty state. */}
          <section className="atlas-empty">
            <strong>No shared routes here yet.</strong>
            <p>Plan a ride of your own, or see what riders have published in <Link href="/routes">Community routes</Link>.</p>
          </section>
        </>
      ) : (
        <AtlasBrowser
          routes={catalog.routes}
          regions={catalog.regions}
          ridingAreas={catalog.ridingAreas}
          routeCount={catalog.routeCount}
          totalMiles={catalog.totalMiles}
          updatedLabel={catalog.updatedLabel}
        />
      )}
      <AppNavigationLinks active="explore" />
    </main>
  )
}
