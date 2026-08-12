import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const passkey = vi.hoisted(() => ({
  registerPasskey: vi.fn(async () => ({ identityId: "rider-12345678901234567890" })),
  authenticatePasskey: vi.fn(async () => ({ identityId: "rider-12345678901234567890" }))
}))

vi.mock("@/lib/client/passkey", () => passkey)
import { ProfilePanel } from "@/components/shell/ProfilePanel"

describe("ProfilePanel", () => {
  let confirmSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cleanup()
    localStorage.clear()
    confirmSpy = vi.fn(() => true)
    vi.stubGlobal("confirm", confirmSpy)
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
})
