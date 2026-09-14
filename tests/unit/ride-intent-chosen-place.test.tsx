import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePlannerRideIntent } from "@/components/planner/usePlannerRideIntent"
import { interpretRidePrompt, isConfidentLocalIntent, parseRidePromptLocally } from "@/lib/ai/ride-intent"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import { pinnedPlaceForQuery } from "@/lib/planner/ride-prompt-flow"
import { completeRidePromptWithPlace, isPlaceCompletionPrompt } from "@/lib/planner/ride-request-autocomplete"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/lib/client/ride-intent-client", () => ({ requestRideIntent: vi.fn() }))
vi.mock("@/lib/client/geocoding-client", () => ({ searchPlacesClient: vi.fn() }))

const start = { lat: 40.7934, lon: -77.86, label: "State College" }
// The suggestion the rider picked. A namesake the geocoder might return for the
// same words lives somewhere else entirely.
const lockHaven = { lat: 41.1370, lon: -77.4469, label: "Lock Haven, Pennsylvania, United States" }

function renderIntent(runTripPlan = vi.fn().mockResolvedValue(null)) {
  const gate = createLatestRequestGate()
  return renderHook(() => usePlannerRideIntent({
    gate,
    home: null,
    targetMinutes: 120,
    avoidAreas: [],
    nextSeed: () => 7,
    runTripPlan,
    setStopIdeas: vi.fn(),
    setResearchSources: vi.fn(),
    setIntentStatus: vi.fn(),
    setIntentSummary: vi.fn(),
    onNotice: vi.fn()
  }))
}

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState({ ...initialPlannerState, start, startQuery: start.label, profile: "quick" })
  vi.mocked(requestRideIntent).mockReset().mockImplementation(async (prompt) => parseRidePromptLocally(prompt))
  vi.mocked(searchPlacesClient).mockReset().mockResolvedValue([{
    id: "namesake",
    label: "Lock Haven, Somewhere Else",
    name: "Lock Haven",
    region: "Elsewhere",
    country: "United States",
    lat: 10,
    lon: 10
  }])
})

afterEach(() => cleanup())

describe("a chosen suggestion is routed as chosen", () => {
  it("routes to the picked coordinates without asking the interpreter or geocoding again", async () => {
    const runTripPlan = vi.fn().mockResolvedValue(null)
    const { result } = renderIntent(runTripPlan)
    const prompt = completeRidePromptWithPlace("Lock Hav", lockHaven.label, "destination")

    await act(async () => {
      await result.current(prompt, lockHaven)
    })

    expect(requestRideIntent).not.toHaveBeenCalled()
    expect(searchPlacesClient).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().finish).toMatchObject({ lat: lockHaven.lat, lon: lockHaven.lon })
    expect(runTripPlan.mock.calls[0]![0].points.at(-1)).toMatchObject({ lat: lockHaven.lat, lon: lockHaven.lon })
  })

  it("keeps the rider's chosen style when the request only names a place", async () => {
    const runTripPlan = vi.fn().mockResolvedValue(null)
    const { result } = renderIntent(runTripPlan)

    await act(async () => {
      await result.current(`Ride to ${lockHaven.label}`, lockHaven)
    })

    expect(usePlannerStore.getState().profile).toBe("quick")
    expect(runTripPlan.mock.calls[0]![0]).toMatchObject({ profile: "quick" })
  })

  it("still interprets added constraints, but keeps the picked place", async () => {
    const runTripPlan = vi.fn().mockResolvedValue(null)
    const { result } = renderIntent(runTripPlan)

    await act(async () => {
      await result.current(`twisty ride to ${lockHaven.label}`, lockHaven)
    })

    expect(requestRideIntent).toHaveBeenCalledTimes(1)
    expect(searchPlacesClient).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().profile).toBe("twisty")
    expect(usePlannerStore.getState().finish).toMatchObject({ lat: lockHaven.lat, lon: lockHaven.lon })
  })

  it("geocodes as before when no suggestion was chosen", async () => {
    const { result } = renderIntent()

    await act(async () => {
      await result.current("Ride to Lock Haven")
    })

    expect(searchPlacesClient).toHaveBeenCalled()
  })
})

describe("chosen-place matching", () => {
  it("recognises only the exact completion text as a place-only request", () => {
    expect(isPlaceCompletionPrompt(`Ride to ${lockHaven.label}`, lockHaven.label)).toBe(true)
    expect(isPlaceCompletionPrompt(`Loop near ${lockHaven.label}`, lockHaven.label)).toBe(true)
    expect(isPlaceCompletionPrompt(`scenic ride to ${lockHaven.label}`, lockHaven.label)).toBe(false)
  })

  it("matches the full label or its leading part, never a bare prefix", () => {
    expect(pinnedPlaceForQuery(lockHaven.label, [lockHaven])).toBe(lockHaven)
    expect(pinnedPlaceForQuery("Lock Haven", [lockHaven])).toBe(lockHaven)
    expect(pinnedPlaceForQuery("Lock", [lockHaven])).toBeNull()
    expect(pinnedPlaceForQuery("Lock Haven, Ohio", [lockHaven])).toBeNull()
  })
})

describe("the interpreter skips the model for requests it already understands", () => {
  it("answers a plain destination or explicit loop locally", async () => {
    const fetcher = vi.fn<typeof fetch>()
    const intent = await interpretRidePrompt("Ride to Lock Haven, PA", { apiKey: "key", fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(intent).toMatchObject({ mode: "destination", destinationQuery: "Lock Haven, PA", source: "local" })
    expect(isConfidentLocalIntent("90 minute twisty loop", parseRidePromptLocally("90 minute twisty loop"))).toBe(true)
  })

  it("still asks the model for open-ended or compound requests", () => {
    for (const prompt of ["Surprise me", "scenic ride to Lock Haven then coffee", "somewhere with good curves"]) {
      expect(isConfidentLocalIntent(prompt, parseRidePromptLocally(prompt))).toBe(false)
    }
  })
})
