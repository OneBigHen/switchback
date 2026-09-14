import type { Metadata } from "next"
import Link from "next/link"
import { getCommunityStore } from "@/app/api/community/context"
import { AppNavigationLinks } from "@/components/shell/AppNavigationLinks"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `Community routes — ${PRODUCT_BRAND.name}`,
  description: "Routes riders chose to publish, as exact sanitized previews."
}

export default function CommunityRoutesPage() {
  const routes = getCommunityStore().listPublicRoutes(50)
  return (
    <main className="community-page">
      <header className="community-page-header">
        <Link href="/?tab=explore" className="community-back-link">← Explore routes</Link>
        <h1>Community routes</h1>
        <p>Browse rider-published previews. Every line here is the exact sanitized artifact the owner chose to share.</p>
      </header>
      {routes.length > 0 ? (
        <ul className="community-route-list">
          {routes.map((route) => (
            <li key={route.id} className="community-route-card">
              <div>
                <p className="community-eyebrow">{route.provenanceClass.replaceAll("-", " ")}</p>
                <h2><Link href={`/routes/${route.id}`}>{route.title}</Link></h2>
                {route.description ? <p>{route.description}</p> : null}
              </div>
              <dl>
                {route.stats.distanceMiles !== undefined ? <><dt>Distance</dt><dd>{String(route.stats.distanceMiles)} mi</dd></> : null}
                {route.stats.durationMinutes !== undefined ? <><dt>Time</dt><dd>{String(route.stats.durationMinutes)} min</dd></> : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <section className="community-empty">
          <strong>No rider has published a route yet.</strong>
          <p>Publish one of yours from Saved, or browse the shared routes in the meantime.</p>
          <Link href="/?tab=explore">Explore routes</Link>
        </section>
      )}
      <AppNavigationLinks active="explore" />
    </main>
  )
}
