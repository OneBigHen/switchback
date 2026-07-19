export interface SpotifyRemoteImage {
  url: string
  width?: number | null
  height?: number | null
}

export interface SpotifyRemoteTrack {
  id: string | null
  uri: string
  type: string
  name: string
  artists: string[]
  album: {
    name: string
    images: SpotifyRemoteImage[]
  }
}

export interface SpotifyRemoteDevice {
  id: string | null
  name: string
  type: string
  isRestricted: boolean
  volumePercent: number | null
  supportsVolume: boolean
}

export interface SpotifyRemoteState {
  device: SpotifyRemoteDevice | null
  isPlaying: boolean
  position: number
  duration: number
  track: SpotifyRemoteTrack | null
}

export interface SpotifyRemotePlaybackResponse {
  active: boolean
  state: SpotifyRemoteState | null
}

export type SpotifyRemoteCommand =
  | { command: "play" | "pause" | "next" | "previous" }
  | { command: "seek"; positionMs: number }
  | { command: "volume"; volumePercent: number }
