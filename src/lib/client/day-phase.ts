import * as SunCalc from "suncalc"
import { useEffect, useState } from "react"

export type DayPhase = "day" | "night" | "dawn" | "dusk"

function safeDate(d: Date | null | undefined, fallback: Date): Date {
  return d ?? fallback
}

export function getDayPhase(
  date: Date,
  latitude: number,
  longitude: number
): DayPhase {
  const times = SunCalc.getTimes(date, latitude, longitude)
  const sunriseEnd = safeDate(times.sunriseEnd as Date | null, date)
  const sunsetStart = safeDate(times.sunsetStart as Date | null, date)
  const sunriseStart = safeDate(times.sunriseStart as Date | null, date)
  const dusk = safeDate(times.dusk as Date | null, date)

  if (date < sunriseEnd || date > sunsetStart) {
    return date < sunriseEnd
      ? (date >= sunriseStart ? "dawn" : "night")
      : (date <= dusk ? "dusk" : "night")
  }

  if (date.getTime() - sunsetStart.getTime() > -30 * 60 * 1000) {
    return "dusk"
  }

  return "day"
}

export function isNightTime(
  date: Date,
  latitude: number,
  longitude: number
): boolean {
  const phase = getDayPhase(date, latitude, longitude)
  return phase === "night" || phase === "dusk"
}

export function useDayPhase(
  latitude: number,
  longitude: number,
  intervalMs = 60_000
): DayPhase {
  const [phase, setPhase] = useState<DayPhase>(() =>
    getDayPhase(new Date(), latitude, longitude)
  )

  useEffect(() => {
    const update = () => setPhase(getDayPhase(new Date(), latitude, longitude))
    update()
    const id = setInterval(update, intervalMs)
    return () => clearInterval(id)
  }, [latitude, longitude, intervalMs])

  return phase
}

export function nextSunEvent(
  date: Date,
  latitude: number,
  longitude: number
): { event: string; time: Date } | null {
  const times = SunCalc.getTimes(date, latitude, longitude)
  const candidates = [
    { event: "sunrise", time: safeDate(times.sunrise, date) },
    { event: "sunset", time: safeDate(times.sunset, date) }
  ].filter((c) => c.time > date)

  if (candidates.length === 0) {
    const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowTimes = SunCalc.getTimes(tomorrow, latitude, longitude)
    return { event: "sunrise", time: safeDate(tomorrowTimes.sunrise, tomorrow) }
  }

  return candidates.sort((a, b) => a.time.getTime() - b.time.getTime())[0]!
}
