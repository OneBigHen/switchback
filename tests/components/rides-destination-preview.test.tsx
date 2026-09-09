import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import { RidesDestination } from "@/components/rides/RidesDestination"

vi.mock("@/components/rides/RidesSurface", () => ({
  RidesSurface: ({ items }: { items: Array<{ id: string; preview?: { paths: string[] } }> }) => (
    <output data-testid="project-preview">
      {items.find((item) => item.id === "project:route-1")?.preview?.paths[0] ?? "none"}
    </output>
  )
}))

const projectRoute: ProjectGpxRouteSummary = {
  id: "route-1",
  name: "Bald Eagle loop",
  distanceMiles: 104.7,
  durationMinutes: 0,
  twistiness: 52,
  turnCount: 180,
  sourceProject: "rideplanner",
  bbox: [-77.8, 40.6, -77.1, 41.1]
}

describe("RidesDestination project route previews", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/gpx-library?preview=1") {
        return Response.json({
          routes: [{
            ...projectRoute,
            preview: {
              paths: ["M10 10 L50 35 L85 100"],
              start: [10, 10],
              end: [85, 100],
              aspect: 0.8
            }
          }]
        })
      }
      return new Response(null, { status: 404 })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("loads lightweight real route shapes when the Rides destination mounts", async () => {
    render(
      <RidesDestination
        routes={[]}
        projectRoutes={[projectRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByTestId("project-preview")).toHaveTextContent("none")

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/gpx-library?preview=1",
        expect.objectContaining({ cache: "no-store" })
      )
      expect(screen.getByTestId("project-preview")).toHaveTextContent("M10 10 L50 35 L85 100")
    })
  })

  it("keeps the already-loaded catalog usable when preview loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })))

    render(
      <RidesDestination
        routes={[]}
        projectRoutes={[projectRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByTestId("project-preview")).toHaveTextContent("none")
  })
})
