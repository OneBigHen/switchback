"use client"

import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowClockwise,
  ArrowFatLeft,
  ArrowFatRight,
  ArrowLeft,
  ArrowRight,
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretUp,
  FlagCheckered,
  NavigationArrow,
  type IconProps
} from "@phosphor-icons/react"
import type { ManeuverKind } from "@/lib/client/maneuver"

const w: IconProps["weight"] = "bold"

const ICON_MAP: Partial<Record<ManeuverKind, React.ReactNode>> = {
  "left": <ArrowBendUpLeft weight={w} />,
  "right": <ArrowBendUpRight weight={w} />,
  "slight-left": <ArrowBendUpLeft weight="light" />,
  "slight-right": <ArrowBendUpRight weight="light" />,
  "sharp-left": <ArrowLeft weight={w} />,
  "sharp-right": <ArrowRight weight={w} />,
  "keep-left": <ArrowFatLeft weight="light" />,
  "keep-right": <ArrowFatRight weight="light" />,
  "merge-left": <ArrowFatLeft weight={w} />,
  "merge-right": <ArrowFatRight weight={w} />,
  "fork-left": <ArrowFatLeft weight={w} />,
  "fork-right": <ArrowFatRight weight={w} />,
  "ramp-left": <ArrowFatLeft weight="light" />,
  "ramp-right": <ArrowFatRight weight="light" />,
  "uturn-left": <ArrowUUpLeft weight={w} />,
  "uturn-right": <ArrowUUpRight weight={w} />,
  "roundabout": <ArrowClockwise weight={w} />,
  "roundabout-enter": <ArrowClockwise weight={w} />,
  "roundabout-exit": <ArrowClockwise weight="light" />,
  "finish": <FlagCheckered weight={w} />,
  "arrive": <FlagCheckered weight={w} />,
  "arrive-via": <FlagCheckered weight="light" />,
  "depart": <NavigationArrow weight={w} />,
  "ferry": <NavigationArrow weight={w} />,
  "elevator": <NavigationArrow weight="light" />,
  "continue": <NavigationArrow weight={w} />,
  "straight": <NavigationArrow weight={w} />
}

export function ManeuverGlyph({ kind }: { kind: ManeuverKind }) {
  return ICON_MAP[kind] ?? <CaretUp weight={w} />
}
