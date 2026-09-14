import type { Metadata } from "next"
import ReconExplorer from "@/features/recon/ui/ReconExplorer"
import "@/features/recon/recon.css"

export const metadata: Metadata = {
  title: "Recon — OpenGravel Labs",
  description: "Explore your recorded rides on pitched, terrain-backed maps, then replay them."
}

export default function ReconLabsPage() {
  return <ReconExplorer />
}
