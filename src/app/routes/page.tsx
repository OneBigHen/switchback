import Link from "next/link"
import { getCommunityStore } from "@/app/api/community/context"

export const dynamic = "force-dynamic"

export default function CommunityRoutesPage() {
  const routes = getCommunityStore().listPublicRoutes(50)
  return (
    <main className="community-page">
      <header className="community-page-header">
        <Link href="/" className="community-back-link">← Switchback planner</Link>
        <p className="community-eyebrow">Community routes</p>
        <h1>Find a better road.</h1>
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
      ) : <p className="community-empty">No public routes yet. Publish one from a saved route.</p>}
    </main>
  )
}
