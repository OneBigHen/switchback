export type ManeuverKind =
  | "straight"
  | "left"
  | "right"
  | "uturn-left"
  | "uturn-right"
  | "roundabout"
  | "finish"

export function maneuverKind(sign: number): ManeuverKind {
  if (sign === 4 || sign === 5) return "finish"
  if (sign === 6) return "roundabout"
  if (sign === -8 || sign === -98) return "uturn-left"
  if (sign === 8) return "uturn-right"
  if (sign < 0) return "left"
  if (sign > 0) return "right"
  return "straight"
}
