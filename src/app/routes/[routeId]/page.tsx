import Link from "next/link"
import { notFound } from "next/navigation"
import { getCommunityStore } from "@/app/api/community/context"
import { CommunityPreviewMap } from "@/components/community/CommunityPreviewMap"
import { CommunityReportForm } from "@/components/community/CommunityReportForm"

export const dynamic = "force-dynamic"

export default async function CommunityRoutePage({ params }: { params: Promise<{ routeId: string }> }) {
  const route = getCommunityStore().getRoute((await params).routeId)
  if (!route) notFound()
  return (
    <main className="community-page">
      <header className="community-page-header">
        <Link href="/routes" className="community-back-link">← All community routes</Link>
        <p className="community-eyebrow">{route.visibility === "public" ? "Public route" : "Unlisted route"}</p>
        <h1>{route.title}</h1>
        {route.description ? <p>{route.description}</p> : null}
      </header>
      <CommunityPreviewMap geometry={route.preview.geometry} ariaLabel={`Sanitized preview map for ${route.title}`} />
      <section className="community-route-facts" aria-label="Route facts">
        <dl>
          <dt>Preview distance</dt><dd>{route.preview.distanceMiles.toFixed(1)} mi</dd>
          <dt>Preview time</dt><dd>{Math.round(route.preview.durationMinutes)} min</dd>
          <dt>Provenance</dt><dd>{route.provenanceClass.replaceAll("-", " ")}</dd>
        </dl>
      </section>
      <div className="community-route-actions">
        <a href={`/api/community/routes/${route.id}/gpx`}>Download preview GPX</a>
        <Link href="/">Plan your own route</Link>
      </div>
      <CommunityReportForm routeId={route.id} />
    </main>
  )
}
