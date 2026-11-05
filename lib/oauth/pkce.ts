import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'

export const codeChallengeSchema = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/)
export const codeVerifierSchema = z.string().min(43).max(128).regex(/^[A-Za-z0-9._~-]+$/)

export function randomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Verifies a PKCE code_verifier against the code_challenge stored at /authorize time. */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method !== 'S256' || !codeVerifierSchema.safeParse(codeVerifier).success) return false
  return createHash('sha256').update(codeVerifier).digest('base64url') === codeChallenge
}
