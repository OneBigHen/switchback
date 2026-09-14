import type { Metadata } from "next"
import ReconExplorer from "@/features/recon/ui/ReconExplorer"
import "@/features/recon/recon.css"

export const metadata: Metadata = {
  title: "3D rides — OpenGravel",
  description: "Your recorded rides and shared routes on pitched, terrain-backed maps, ready to replay in 3D."
}

export default function ReconLabsPage() {
  return <ReconExplorer />
}
