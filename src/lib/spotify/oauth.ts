import { SPOTIFY_AUTHORIZE_URL, SPOTIFY_SCOPES } from "./constants"

const PKCE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

function randomPkceString(length: number): string {
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (value) => PKCE_CHARACTERS[value % PKCE_CHARACTERS.length]).join("")
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function challengeFor(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))
  return base64Url(new Uint8Array(digest))
}

export interface PkcePair {
  codeVerifier: string
  codeChallenge: string
  state: string
}

export async function createPkcePair(overrides: {
  codeVerifier?: string
  state?: string
} = {}): Promise<PkcePair> {
  const codeVerifier = overrides.codeVerifier ?? randomPkceString(64)
  const state = overrides.state ?? randomPkceString(32)
  return {
    codeVerifier,
    codeChallenge: await challengeFor(codeVerifier),
    state
  }
}

export function buildSpotifyAuthorizationUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): URL {
  const url = new URL(SPOTIFY_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: input.codeChallenge,
    prompt: "consent"
  }).toString()
  return url
}
