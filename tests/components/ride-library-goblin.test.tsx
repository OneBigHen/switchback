import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RideLibraryGoblin } from "@/components/rides/RideLibraryGoblin"

afterEach(cleanup)

describe("RideLibraryGoblin", () => {
  it("keeps saved-route search explicit and hands generation to the existing planner", () => {
    const onQueryChange = vi.fn()
    const onGenerateNew = vi.fn()
    render(
      <RideLibraryGoblin
        query=""
        resultCount={12}
        onQueryChange={onQueryChange}
        onGenerateNew={onGenerateNew}
      />
    )

    expect(screen.getByRole("group", { name: "Gravel Goblin route mode" })).toBeInTheDocument()
    const search = screen.getByRole("searchbox", { name: "Ask Gravel Goblin to search saved rides" })
    fireEvent.change(search, { target: { value: "NE under 60 miles River Road" } })
    expect(onQueryChange).toHaveBeenCalledWith("NE under 60 miles River Road")

    fireEvent.click(screen.getByRole("button", { name: "Generate new" }))
    expect(screen.queryByRole("searchbox", { name: "Ask Gravel Goblin to search saved rides" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Gravel Goblin planner" }))
    expect(onGenerateNew).toHaveBeenCalledTimes(1)
  })
})
