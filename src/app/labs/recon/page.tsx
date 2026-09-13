import type { Metadata } from "next";
import ReconExplorer from "@/features/recon/components/recon-explorer";

export const metadata: Metadata = {
  title: "Recon — OpenGravel Labs",
  description:
    "An experimental Labs surface for exploring recorded rides and saved routes on a flat map.",
};

export default function ReconLabsPage() {
  return <ReconExplorer />;
}
