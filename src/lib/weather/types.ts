export interface RouteWeatherCoordinate {
  lat: number
  lon: number
}

export interface RouteWeatherLocation {
  city: string
  state: string
}

export interface RouteWeatherHour {
  startTime: string
  isDaytime: boolean
  temperatureF: number | null
  precipitationChance: number | null
  windSpeedMph: number | null
  windDirection: string | null
  shortForecast: string
}

export interface RouteWeatherAlert {
  id: string
  event: string
  headline: string
  severity: string | null
  urgency: string | null
  certainty: string | null
  onset: string | null
  expires: string | null
}

export interface RouteWeatherSample {
  coordinate: RouteWeatherCoordinate
  location: RouteWeatherLocation | null
  status: "ok" | "degraded"
  forecastUpdatedAt: string | null
  hourly: RouteWeatherHour[]
  alerts: RouteWeatherAlert[]
  unavailable: Array<"forecast" | "alerts">
}

export interface RouteWeatherResponse {
  source: "nws"
  samples: RouteWeatherSample[]
}
