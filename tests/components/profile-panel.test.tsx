import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const passkey = vi.hoisted(() => ({
  registerPasskey: vi.fn(async () => ({ identityId: "rider-12345678901234567890" })),
  authenticatePasskey: vi.fn(async () => ({ identityId: "rider-12345678901234567890" }))
}))

const syncController = vi.hoisted(() => ({
  ensureState: vi.fn(async () => ({ id: "state" as const, namespaceId: "ns-profile-test-1", root: new Uint8Array(32), linked: false, createdAt: "2026-08-12T10:00:00.000Z" })),
  exportRecoveryKit: vi.fn(async () => ({ format: "switchback-sync-recovery" as const, version: 1 as const, namespaceId: "ns-profile-test-1", seed: "SB1.ns-profile-test-1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAA", qrPayload: "SB1.ns-profile-test-1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAA" })),
  linkCurrentSession: vi.fn(async () => ({ id: "state" as const, namespaceId: "ns-profile-test-1", root: new Uint8Array(32), linked: true, createdAt: "2026-08-12T10:00:00.000Z" })),
  linkWithPasskey: vi.fn(async () => ({ id: "state" as const, namespaceId: "ns-profile-test-1", root: new Uint8Array(32), linked: true, createdAt: "2026-08-12T10:00:00.000Z" })),
  sync: vi.fn(async () => ({ pushed: 1, pulled: 1, conflicts: 0, pending: 0 })),
  store: {
    importRecoveryKit: vi.fn(async () => ({ id: "state" as const, namespaceId: "ns-profile-test-1", root: new Uint8Array(32), linked: false, createdAt: "2026-08-12T10:00:00.000Z" }))
  }
}))

vi.mock("@/lib/client/passkey", () => passkey)
vi.mock("@/lib/client/sync-controller", () => ({ createSyncController: vi.fn(() => syncController) }))
import { ProfilePanel } from "@/components/shell/ProfilePanel"

describe("ProfilePanel advanced account and data tools", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:recovery") })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
  })

  it("does not duplicate everyday rider, bike, routing, or theme settings", () => {
    render(<ProfilePanel onOpenDownloads={vi.fn()} />)

    expect(screen.getByRole("dialog", { name: "Account, sync & rider data" })).toBeVisible()
    expect(screen.queryByRole("textbox", { name: "Rider name" })).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Theme" })).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Default route style" })).not.toBeInTheDocument()
    expect(screen.queryByRole("spinbutton", { name: "Fuel range in miles" })).not.toBeInTheDocument()
  })

  it("opens offline download management from the advanced data surface", () => {
    const onOpenDownloads = vi.fn()
    render(<ProfilePanel onOpenDownloads={onOpenDownloads} />)
    fireEvent.click(screen.getByRole("button", { name: "Offline regions" }))
    expect(onOpenDownloads).toHaveBeenCalledOnce()
  })

  it("keeps learned preferences when the rider cancels reset confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const onResetLearning = vi.fn(async () => undefined)
    render(<ProfilePanel onOpenDownloads={vi.fn()} onResetLearning={onResetLearning} />)

    fireEvent.click(screen.getByRole("button", { name: "Reset learning" }))

    expect(confirm).toHaveBeenCalledWith("Reset all learned preferences? This cannot be undone.")
    expect(onResetLearning).not.toHaveBeenCalled()
    expect(screen.queryByText("Learning profile reset.")).not.toBeInTheDocument()
  })

  it("reports the actual learned-preference reset result", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const onResetLearning = vi.fn().mockRejectedValue(new Error("storage failed"))
    render(<ProfilePanel onOpenDownloads={vi.fn()} onResetLearning={onResetLearning} />)

    fireEvent.click(screen.getByRole("button", { name: "Reset learning" }))

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Learning profile reset failed."))
    expect(onResetLearning).toHaveBeenCalledOnce()
  })

  it("downloads the actual learned-preference profile before reporting export success", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    const onExportLearning = vi.fn(async () => [{ bikeId: "bike-1", profile: "neural", sampleCount: 3 }])
    render(<ProfilePanel onOpenDownloads={vi.fn()} onExportLearning={onExportLearning} />)

    fireEvent.click(screen.getByRole("button", { name: "Export learning" }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recovery")
    expect(screen.getByRole("status")).toHaveTextContent("Learning profile exported.")
  })

  it("offers optional passkey identity without reintroducing rider settings controls", async () => {
    render(<ProfilePanel onOpenDownloads={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Create Switchback ID" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Switchback ID ready/i))
    expect(passkey.registerPasskey).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "Use existing passkey" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Signed in/i))
    expect(passkey.authenticatePasskey).toHaveBeenCalledOnce()
  })

  it("exports a recovery QR/seed and keeps sync behind explicit linking", async () => {
    render(<ProfilePanel onOpenDownloads={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Export recovery kit" }))
    await waitFor(() => expect(screen.getByTitle("Switchback encrypted sync recovery QR code")).toBeInTheDocument())
    expect(screen.getByText(/SB1\.ns-profile-test-1/)).toBeVisible()
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Authenticate and link device" }))
    await waitFor(() => expect(syncController.linkWithPasskey).toHaveBeenCalledOnce())
  })
})
