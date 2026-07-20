import "fake-indexeddb/auto"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StorageQuotaMeter } from "@/components/planner/StorageQuotaMeter"
import { formatRegionBytes } from "@/lib/offline/region-catalog"

const megabyte = 1024 * 1024
const gigabyte = 1024 * 1024 * 1024

const storageApi = vi.hoisted(() => ({
  estimate: vi.fn(),
  persist: vi.fn(),
  persisted: vi.fn()
}))

function installStorageApi() {
  Object.defineProperty(globalThis.navigator, "storage", {
    configurable: true,
    value: {
      estimate: storageApi.estimate,
      persist: storageApi.persist,
      persisted: storageApi.persisted
    }
  })
}

function clearStorageApi() {
  Reflect.deleteProperty(globalThis.navigator, "storage")
}

describe("StorageQuotaMeter", () => {
  beforeEach(() => {
    installStorageApi()
    storageApi.estimate.mockReset()
    storageApi.persist.mockReset()
    storageApi.persisted.mockReset()
  })

  afterEach(() => {
    cleanup()
    clearStorageApi()
  })

  it("renders the normal tier badge when usage is below 70%", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.1 * gigabyte, quota: 2 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)

    render(
      <StorageQuotaMeter
        installedBytes={0.1 * gigabyte}
        pendingPackageBytes={null}
      />
    )

    await waitFor(() => expect(screen.getByText("Healthy")).toBeInTheDocument())
    expect(screen.getByText(/Current usage/)).toBeInTheDocument()
    expect(screen.getByText(formatRegionBytes(0.1 * gigabyte))).toBeInTheDocument()
  })

  it("renders the warn tier badge when usage crosses 70%", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.72 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)

    render(
      <StorageQuotaMeter installedBytes={0.72 * gigabyte} pendingPackageBytes={null} />
    )

    await waitFor(() => expect(screen.getByText("High use")).toBeInTheDocument())
    const warnTier = screen.getByText("High use").closest(".storage-quota-meter-tier")
    expect(warnTier?.getAttribute("data-tier")).toBe("warn")
  })

  it("renders the strong-warn tier badge when usage crosses 85%", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.9 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)

    render(
      <StorageQuotaMeter installedBytes={0.9 * gigabyte} pendingPackageBytes={null} />
    )

    await waitFor(() => expect(screen.getByText("Near limit")).toBeInTheDocument())
    const strongTier = screen.getByText("Near limit").closest(".storage-quota-meter-tier")
    expect(strongTier?.getAttribute("data-tier")).toBe("strong-warn")
  })

  it("shows the projection as blocked when the pending package overflows quota", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.9 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(true)

    const onProjectionChange = vi.fn()

    render(
      <StorageQuotaMeter
        installedBytes={0.9 * gigabyte}
        pendingPackageBytes={300 * megabyte}
        onProjectionChange={onProjectionChange}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/exceed the browser-reported storage quota/i)).toBeInTheDocument()
    })
    const projection = screen.getByText(/exceed the browser-reported storage quota/i).closest(".storage-quota-meter-projection")
    expect(projection?.getAttribute("data-blocked")).toBe("true")
    await waitFor(() => {
      const last = onProjectionChange.mock.calls.at(-1)?.[0]
      expect(last?.permitted).toBe(false)
    })
  })

  it("shows the projection as permitted when an install fits within the reserve", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.1 * gigabyte, quota: 2 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)

    render(
      <StorageQuotaMeter installedBytes={0.1 * gigabyte} pendingPackageBytes={80 * megabyte} />
    )

    await waitFor(() => expect(screen.getByText(/Install fits within policy/i)).toBeInTheDocument())
    const projection = screen.getByText(/Install fits within policy/i).closest(".storage-quota-meter-projection")
    expect(projection?.getAttribute("data-blocked")).toBe("false")
  })

  it("shows the durable-storage CTA when persistence has not been granted", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.05 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)

    render(
      <StorageQuotaMeter installedBytes={0.05 * gigabyte} pendingPackageBytes={null} />
    )

    await waitFor(() => expect(screen.getByRole("button", { name: /Request durable storage/i })).toBeInTheDocument())
    expect(screen.getByText(/Browser-stored data is not guaranteed permanent/i)).toBeInTheDocument()
  })

  it("surfaces persistence status when durable storage was previously granted", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.05 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(true)

    render(
      <StorageQuotaMeter installedBytes={0.05 * gigabyte} pendingPackageBytes={null} />
    )

    await waitFor(() => expect(screen.getByText(/Persistent storage granted/i)).toBeInTheDocument())
    const persistentRow = screen.getByText(/Persistent storage granted/i).closest(".storage-quota-meter-persist")
    expect(persistentRow?.getAttribute("data-persistent")).toBe("true")
  })

  it("calls requestPersistentStorage when the durable-storage CTA is clicked", async () => {
    storageApi.estimate.mockResolvedValue({ usage: 0.05 * gigabyte, quota: 1 * gigabyte })
    storageApi.persisted.mockResolvedValue(false)
    storageApi.persist.mockResolvedValue(true)

    const { getByRole } = render(
      <StorageQuotaMeter installedBytes={0.05 * gigabyte} pendingPackageBytes={null} />
    )

    await waitFor(() => expect(getByRole("button", { name: /Request durable storage/i })).toBeInTheDocument())
    const button = getByRole("button", { name: /Request durable storage/i })
    button.click()
    await waitFor(() => expect(storageApi.persist).toHaveBeenCalledTimes(1))
  })
})
