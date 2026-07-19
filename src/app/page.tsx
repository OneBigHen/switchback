import { lazy, Suspense } from "react"
import { PlannerShell } from "@/components/planner/PlannerShell"

const SpotifyPlayerDock = lazy(() =>
  import("@/components/spotify/SpotifyPlayerDock").then(mod => ({ default: mod.SpotifyPlayerDock }))
)

export default function HomePage() {
  return (
    <>
      <PlannerShell />
      <Suspense fallback={null}>
        <SpotifyPlayerDock />
      </Suspense>
    </>
  )
}
