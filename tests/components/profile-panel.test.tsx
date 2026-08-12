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

describe("ProfilePanel", () => {
  let confirmSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    localStorage.clear()
    confirmSpy = vi.fn(() => true)
    vi.stubGlobal("confirm", confirmSpy)
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:recovery") })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
  })

  it("edits the rider profile into the versioned settings store without an account", () => {
    const onThemeChange = vi.fn()
    render(<ProfilePanel theme="auto" onThemeChange={onThemeChange} onOpenDownloads={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Profile and settings" })).toBeVisible()
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } })
    expect(onThemeChange).toHaveBeenCalledWith("dark")

    fireEvent.change(screen.getByRole("textbox", { name: "Rider name" }), { target: { value: "Alex" } })
    // Edits persist immediately into the one versioned settings source (SB-023).
    expect(localStorage.getItem("switchback:rider-settings")).toContain("Alex")
    expect(localStorage.getItem("switchback:rider-settings")).toContain('"version":1')
  })

  it("opens offline download management from profile settings", () => {
    const onOpenDownloads = vi.fn()
    render(<ProfilePanel theme="light" onThemeChange={vi.fn()} onOpenDownloads={onOpenDownloads} />)
    fireEvent.click(screen.getByRole("button", { name: "Offline regions" }))
    expect(onOpenDownloads).toHaveBeenCalledOnce()
  })

  it("resets learned preferences after an explicit confirmation", () => {
    const onResetLearning = vi.fn()
    render(<ProfilePanel theme="light" onThemeChange={vi.fn()} onOpenDownloads={vi.fn()} onResetLearning={onResetLearning} />)
    fireEvent.click(screen.getByRole("button", { name: "Reset learning" }))
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(onResetLearning).toHaveBeenCalledOnce()
  })

  it("offers optional passkey identity without changing local rider settings", async () => {
    render(<ProfilePanel theme="light" onThemeChange={vi.fn()} onOpenDownloads={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Create Switchback ID" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Switchback ID ready/i))
    expect(passkey.registerPasskey).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "Use existing passkey" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Signed in with Switchback ID/i))
    expect(passkey.authenticatePasskey).toHaveBeenCalledOnce()
  })

  it("exports a recovery QR/seed and keeps sync behind explicit linking", async () => {
    render(<ProfilePanel theme="light" onThemeChange={vi.fn()} onOpenDownloads={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Export recovery kit" }))
    await waitFor(() => expect(screen.getByTitle("Switchback encrypted sync recovery QR code")).toBeInTheDocument())
    expect(screen.getByText(/SB1\.ns-profile-test-1/)).toBeVisible()
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Authenticate and link device" }))
    await waitFor(() => expect(syncController.linkWithPasskey).toHaveBeenCalledOnce())
  })
})
