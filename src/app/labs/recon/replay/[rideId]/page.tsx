import type { Metadata } from "next";
import ReconShell from "@/features/recon/ui/ReconShell";
import "@/features/recon/recon.css";

export const metadata: Metadata = {
 title: "Recon — OpenGravel Labs",
 description:
  "A focused view of one recorded ride or Route Library preview on the Recon explorer.",
};

/**
 * The focused ride view. The URL segment is `replay` (frozen by the run's
 * routing contract); the view itself presents the track truthfully — a
 * recorded ride or a route preview on the pitched Explorer — and only ever
 * earns replay language when real playback exists.
 */
export default async function ReconReplayPage({
 params,
}: {
 params: Promise<{ rideId: string }>;
}) {
 const { rideId } = await params;
 return <ReconShell focusedTrackId={decodeURIComponent(rideId)} />;
}
