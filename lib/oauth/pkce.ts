import { createHash, randomBytes } from 'crypto'

export function randomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Verifies a PKCE code_verifier against the code_challenge stored at /authorize time. */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === 'plain') return codeVerifier === codeChallenge
  if (method === 'S256') {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url')
    return hash === codeChallenge
  }
  return false
}
