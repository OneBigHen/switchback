import type { Metadata } from "next"
import ReconRideView from "@/features/recon/ui/ReconRideView"
import "@/features/recon/recon.css"

export const metadata: Metadata = {
  title: "Replay — OpenGravel Recon",
  description: "Replay a recorded ride on its real GPS timeline, with X-Ray and Cinematic views."
}

export default async function ReconReplayPage({
  params,
  searchParams
}: {
  params: Promise<{ rideId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ rideId }, query] = await Promise.all([params, searchParams])
  return <ReconRideView key={rideId} trackId={safeDecode(rideId)} startFilm={query.film === "1"} />
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
