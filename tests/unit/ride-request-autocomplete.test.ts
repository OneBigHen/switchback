import { describe, expect, it } from "vitest"
import {
  completeRidePromptWithPlace,
  ridePromptPlaceQuery
} from "@/lib/planner/ride-request-autocomplete"

describe("ride request place autocomplete", () => {
  it("searches the location fragment instead of the whole ride sentence", () => {
    expect(ridePromptPlaceQuery("90-minute scenic loop near Aus")).toBe("Aus")
    expect(ridePromptPlaceQuery("Ride to New H")).toBe("New H")
    expect(ridePromptPlaceQuery("starting in Phil")).toBe("Phil")
  })

  it("allows a bare place query but does not geocode generic ride prose", () => {
    expect(ridePromptPlaceQuery("Austin")).toBe("Austin")
    expect(ridePromptPlaceQuery("New Hope PA")).toBe("New Hope PA")
    expect(ridePromptPlaceQuery("A scenic ride with curves and coffee")).toBeNull()
  })

  it("does not turn current-location language into a place search", () => {
    expect(ridePromptPlaceQuery("90-minute loop near me")).toBeNull()
    expect(ridePromptPlaceQuery("loop near current location")).toBeNull()
    expect(ridePromptPlaceQuery("starting near my location")).toBeNull()
    expect(ridePromptPlaceQuery("here")).toBeNull()
  })

  it("preserves ride constraints when completing a trailing place", () => {
    expect(completeRidePromptWithPlace(
      "90-minute scenic loop near Aus",
      "Austin, Texas, United States",
      "loop"
    )).toBe("90-minute scenic loop near Austin, Texas, United States")

    expect(completeRidePromptWithPlace(
      "Ride to New H",
      "New Hope, Pennsylvania, United States",
      "destination"
    )).toBe("Ride to New Hope, Pennsylvania, United States")
  })

  it("turns a bare place into an explicit destination or loop origin", () => {
    expect(completeRidePromptWithPlace(
      "Aus",
      "Austin, Texas, United States",
      "destination"
    )).toBe("Ride to Austin, Texas, United States")

    expect(completeRidePromptWithPlace(
      "Aus",
      "Austin, Texas, United States",
      "loop"
    )).toBe("Loop near Austin, Texas, United States")
  })
})
