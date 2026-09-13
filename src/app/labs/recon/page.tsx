import type { Metadata } from "next";
import ReconShell from "@/features/recon/ui/ReconShell";
import "@/features/recon/recon.css";

export const metadata: Metadata = {
  title: "Recon — OpenGravel Labs",
  description:
    "An experimental Labs surface for exploring recorded rides and Route Library previews on a pitched, terrain-backed map.",
};

export default function ReconLabsPage() {
  return <ReconShell />;
}
