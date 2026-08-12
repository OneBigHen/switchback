import {
  generateAuthenticationOptions as simpleGenerateAuthenticationOptions,
  generateRegistrationOptions as simpleGenerateRegistrationOptions,
  verifyAuthenticationResponse as simpleVerifyAuthenticationResponse,
  verifyRegistrationResponse as simpleVerifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential
} from "@simplewebauthn/server"

export class WebAuthnConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebAuthnConfigError"
  }
}

export interface WebAuthnConfig {
  rpName: string
  rpID: string
  expectedOrigin: string
}

export interface RegistrationOptionsInput {
  rpName: string
  rpID: string
  userName: string
  challenge: string
  userDisplayName?: string
  attestationType?: "direct" | "enterprise" | "none"
  authenticatorSelection?: Parameters<typeof simpleGenerateRegistrationOptions>[0]["authenticatorSelection"]
}

export interface RegistrationVerificationResult {
  verified: boolean
  registrationInfo?: {
    credential: {
      id: string
      publicKey: Uint8Array
      counter: number
    }
  }
}

export interface AuthenticationOptionsInput {
  rpID: string
  challenge: string
  userVerification?: "required" | "preferred" | "discouraged"
}

export interface AuthenticationVerificationResult {
  verified: boolean
  authenticationInfo?: {
    credentialID: string
    newCounter: number
  }
}

export interface WebAuthnVerifier {
  generateRegistrationOptions(input: RegistrationOptionsInput): Promise<PublicKeyCredentialCreationOptionsJSON>
  generateAuthenticationOptions(input: AuthenticationOptionsInput): Promise<PublicKeyCredentialRequestOptionsJSON>
  verifyRegistrationResponse(input: Parameters<typeof simpleVerifyRegistrationResponse>[0]): Promise<RegistrationVerificationResult>
  verifyAuthenticationResponse(input: Parameters<typeof simpleVerifyAuthenticationResponse>[0]): Promise<AuthenticationVerificationResult>
}

export function getWebAuthnVerifier(): WebAuthnVerifier {
  return {
    generateRegistrationOptions: (input) => simpleGenerateRegistrationOptions(input),
    generateAuthenticationOptions: (input) => simpleGenerateAuthenticationOptions(input),
    verifyRegistrationResponse: async (input) => {
      const result = await simpleVerifyRegistrationResponse(input)
      return result.verified
        ? { verified: true, registrationInfo: { credential: result.registrationInfo.credential } }
        : { verified: false }
    },
    verifyAuthenticationResponse: async (input) => {
      const result = await simpleVerifyAuthenticationResponse(input)
      return {
        verified: result.verified,
        ...(result.verified ? { authenticationInfo: result.authenticationInfo } : {})
      }
    }
  }
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON, WebAuthnCredential }

const LOCAL_ORIGIN = "http://localhost:3000"

function requiredOrigin(value: string, production: boolean): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_ORIGIN must be an absolute origin")
  }
  if (parsed.origin !== value || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_ORIGIN must contain only an origin")
  }
  if (production && parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_ORIGIN must use HTTPS in production")
  }
  return value
}

function requiredRpId(value: string): string {
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(value)) {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_RP_ID must be a hostname")
  }
  return value
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const production = process.env.NODE_ENV === "production"
  const expectedOrigin = process.env.SWITCHBACK_WEBAUTHN_ORIGIN?.trim() || (production ? "" : LOCAL_ORIGIN)
  const rpID = process.env.SWITCHBACK_WEBAUTHN_RP_ID?.trim() || (production ? "" : "localhost")
  if (!expectedOrigin || !rpID) {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_RP_ID and SWITCHBACK_WEBAUTHN_ORIGIN are required")
  }
  const origin = requiredOrigin(expectedOrigin, production)
  const relyingPartyId = requiredRpId(rpID)
  const originHostname = new URL(origin).hostname.toLowerCase()
  const relyingPartyHostname = relyingPartyId.toLowerCase()
  if (originHostname !== relyingPartyHostname && !originHostname.endsWith(`.${relyingPartyHostname}`)) {
    throw new WebAuthnConfigError("SWITCHBACK_WEBAUTHN_RP_ID must match the origin hostname or a parent domain")
  }
  return {
    rpID: relyingPartyId,
    expectedOrigin: origin,
    rpName: (process.env.SWITCHBACK_WEBAUTHN_RP_NAME?.trim() || "Switchback").slice(0, 64)
  }
}
