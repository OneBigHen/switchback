import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OpenGravelMark } from "@/components/brand/OpenGravelMark"

describe("OpenGravelMark", () => {
  afterEach(() => {
    cleanup()
  })

  it("exposes an accessible image name when a title is supplied", () => {
    render(<OpenGravelMark title="OpenGravel" />)

    const mark = screen.getByRole("img", { name: "OpenGravel" })
    expect(mark).toHaveAttribute("aria-labelledby")
    expect(mark.querySelector("title")).toHaveTextContent("OpenGravel")
  })

  it("is hidden from assistive technology when it is decorative", () => {
    const { container } = render(<OpenGravelMark className="test-mark" />)

    const mark = container.querySelector("svg")
    expect(mark).toHaveClass("test-mark")
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark).not.toHaveAttribute("role", "img")
    expect(mark?.querySelector("title")).toBeNull()
  })
})
