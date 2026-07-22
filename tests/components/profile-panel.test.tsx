import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProfilePanel } from "@/components/shell/ProfilePanel"

describe("ProfilePanel", () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("edits a local rider profile and theme without an account", () => {
    const onThemeChange = vi.fn()
    render(<ProfilePanel theme="auto" onThemeChange={onThemeChange} onOpenDownloads={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Rider profile" })).toBeVisible()
    expect(screen.getByText(/No account required/i)).toBeVisible()
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } })
    expect(onThemeChange).toHaveBeenCalledWith("dark")

    fireEvent.change(screen.getByRole("textbox", { name: "Rider name" }), { target: { value: "Alex" } })
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
    expect(localStorage.getItem("switchback:rider-profile")).toContain("Alex")
  })

  it("opens offline download management from storage settings", () => {
    const onOpenDownloads = vi.fn()
    render(<ProfilePanel theme="light" onThemeChange={vi.fn()} onOpenDownloads={onOpenDownloads} />)
    fireEvent.click(screen.getByRole("button", { name: "Manage offline downloads" }))
    expect(onOpenDownloads).toHaveBeenCalledOnce()
  })
})
