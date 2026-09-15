import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RegionDownloadsPanel } from "@/components/planner/RegionDownloadsPanel"
import { telemetry } from "@/lib/telemetry/client"

const DAILY_MANIFEST_CHECK_KEY = "switchback:region-manifest-last-check"
let downloadError: Error | null = null

vi.mock("@/lib/storage/region-download-client", () => {
  class FakeRegionDownloadClient {
    async list(): Promise<Array<{ id: string; builtAt: string; downloadedAt: string }>> {
      return [{ id: "pennsylvania", builtAt: "2026-08-01T00:00:00.000Z", downloadedAt: "2026-08-01T00:00:00.000Z" }]
    }
    async getEntry(): Promise<{ id: string; bundleVersion: string; builtAt: string; downloadedAt: string } | null> {
      return { id: "pennsylvania", bundleVersion: "2", builtAt: "2026-08-01T00:00:00.000Z", downloadedAt: "2026-08-01T00:00:00.000Z" }
    }
    async getTotalBytes(): Promise<number> {
      return 0
    }
    async download(): Promise<void> {
      if (downloadError) throw downloadError
    }
    pause(): void { /* no-op in this test */ }
    remove(): Promise<void> { return Promise.resolve() }
    install(): Promise<void> { return Promise.resolve() }
    cancel(): void { /* no-op in this test */ }
  }
  return { RegionDownloadClient: FakeRegionDownloadClient }
})

const pendingRoute = {
  id: "ride-1",
  waypoints: [
    { lat: 40.5, lon: -77.0 },
    { lat: 40.7, lon: -76.5 }
  ]
}

function renderPanel(onBuildCorridor: (route: { id: string; waypoints: { lat: number; lon: number }[] }) => void = () => {}) {
  return render(
    <RegionDownloadsPanel
      activeWaypoints={[[-77.0, 40.5], [-76.5, 40.7]]}
      pendingRoute={pendingRoute}
      onBuildCorridor={onBuildCorridor}
    />
  )
}

describe("RegionDownloadsPanel corridor rebuild wiring", () => {
  beforeEach(() => {
    window.localStorage.setItem(DAILY_MANIFEST_CHECK_KEY, "0")
    downloadError = null
  })

  afterEach(() => {
    cleanup()
    window.localStorage.removeItem(DAILY_MANIFEST_CHECK_KEY)
    vi.restoreAllMocks()
  })

  it("offers a corridor rebuild when a downloaded region is newer than the saved pack", async () => {
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText(/A newer Pennsylvania map is available/)).toBeInTheDocument()
    })
  })

  it("passes the pending route to onBuildCorridor when Rebuild now is chosen", async () => {
    const onBuildCorridor = vi.fn()
    renderPanel(onBuildCorridor)

    await waitFor(() => {
      expect(screen.getByText(/A newer Pennsylvania map is available/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Rebuild now" }))
    expect(onBuildCorridor).toHaveBeenCalledTimes(1)
    expect(onBuildCorridor).toHaveBeenCalledWith(pendingRoute)
  })

  it("records an aggregate offline download lifecycle without a region identifier", async () => {
    const capture = vi.spyOn(telemetry, "capture")
    renderPanel()

    const download = await screen.findByRole("button", { name: "Download offline data for New Jersey" })
    fireEvent.click(download)

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("offline_pack_download_started", expect.objectContaining({
        offline_reason: "manual",
        region_count_band: "1",
        pack_size_band: "5mb+"
      }))
      expect(capture).toHaveBeenCalledWith("offline_pack_download_completed", expect.objectContaining({
        region_count_band: "1",
        pack_size_band: "5mb+"
      }))
    })
    expect(JSON.stringify(capture.mock.calls)).not.toContain("new-jersey")
  })

  it("records a failed offline download with a bounded failure class", async () => {
    const capture = vi.spyOn(telemetry, "capture")
    downloadError = new Error("device storage quota exceeded")
    renderPanel()

    fireEvent.click(await screen.findByRole("button", { name: "Download offline data for New Jersey" }))

    await waitFor(() => expect(capture).toHaveBeenCalledWith("offline_pack_download_failed", expect.objectContaining({
      failure_class: "storage-failure",
      region_count_band: "1",
      pack_size_band: "5mb+"
    })))
    expect(capture).toHaveBeenCalledWith("app_error", {
      error_class: "storage-failure",
      feature: "offline",
      surface: "offline",
      recoverable: true,
      recovery_path: "retry",
      user_impact: "degraded"
    })
  })
})
