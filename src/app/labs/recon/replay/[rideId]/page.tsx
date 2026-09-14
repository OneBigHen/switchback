import type { Metadata } from "next"
import { CATALOG_PREFIX } from "@/features/recon/data/catalog-route-adapter"
import ReconRideView from "@/features/recon/ui/ReconRideView"
import "@/features/recon/recon.css"

export const metadata: Metadata = {
  title: "3D replay — OpenGravel",
  description: "Replay a recorded ride on its real GPS timeline in 3D, or fly over a shared route."
}

export default async function ReconReplayPage({
  params,
  searchParams
}: {
  params: Promise<{ rideId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ rideId }, query] = await Promise.all([params, searchParams])
  const trackId = safeDecode(rideId)
  return <ReconRideView key={rideId} trackId={trackId} startFilm={query.film === "1"} back={backLink(trackId, query.from)} />
}

/**
 * Where "back" goes. The 3D view is opened from a route page or from Saved,
 * and back should return there rather than to a list the rider never saw.
 * Only these fixed destinations are honoured, never a URL from the query.
 */
function backLink(trackId: string, from: string | string[] | undefined): { href: string; label: string } {
  if (from === "route" && trackId.startsWith(CATALOG_PREFIX)) {
    return { href: `/gpx-library/${encodeURIComponent(trackId.slice(CATALOG_PREFIX.length))}`, label: "Route" }
  }
  if (from === "saved") return { href: "/?tab=saved", label: "Saved" }
  return { href: "/labs/recon", label: "All rides" }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
