import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A Supabase session minted server-side exclusively for an AI client (MCP /
 * REST). It has its own refresh-token family, so rotating it never invalidates
 * the user's browser session (and vice versa).
 */
export interface IndependentSession {
  accessToken: string
  refreshToken: string
  expiresAtMs: number
}

type AdminAuthLike = Pick<SupabaseClient, 'auth'>
type AnonAuthLike = Pick<SupabaseClient, 'auth'>

function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; status?: unknown; message?: unknown }
    if (typeof e.code === 'string' && e.code) return e.code
    if (typeof e.status === 'number') return `status_${e.status}`
    if (typeof e.message === 'string' && e.message) return e.message.slice(0, 120)
  }
  return 'unknown'
}

/**
 * Creates a brand-new Supabase session for `email`, independent of any
 * existing (browser) session: the service-role client generates a magic-link
 * token (no email is sent) and the anon client immediately redeems it.
 * Returns null on any failure. Never logs tokens or the email.
 */
export async function mintIndependentSession(
  admin: AdminAuthLike,
  anon: AnonAuthLike,
  email: string | null | undefined
): Promise<IndependentSession | null> {
  if (typeof email !== 'string' || !email.trim()) {
    console.warn('[mcp-auth] mint session failed: missing_email')
    return null
  }
  try {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = linkData?.properties?.hashed_token
    if (linkError || !tokenHash) {
      console.warn(`[mcp-auth] mint session failed (generateLink): ${linkError ? errorCode(linkError) : 'no_hashed_token'}`)
      return null
    }

    const { data: otpData, error: otpError } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    const session = otpData?.session
    if (otpError || !session?.access_token || !session.refresh_token) {
      console.warn(`[mcp-auth] mint session failed (verifyOtp): ${otpError ? errorCode(otpError) : 'no_session'}`)
      return null
    }

    const expiresAtMs =
      typeof session.expires_at === 'number'
        ? session.expires_at * 1000
        : (jwtExpiryMs(session.access_token) ??
          Date.now() + (typeof session.expires_in === 'number' ? session.expires_in * 1000 : 0))

    return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAtMs }
  } catch (err) {
    console.warn(`[mcp-auth] mint session failed (exception): ${errorCode(err)}`)
    return null
  }
}

/**
 * Reads the `exp` claim (seconds) of a JWT and returns it in milliseconds.
 * No signature verification: only used to learn when a token we already hold
 * expires. Returns null if the token can't be decoded.
 */
export function jwtExpiryMs(accessToken: string | null | undefined): number | null {
  if (typeof accessToken !== 'string') return null
  const parts = accessToken.split('.')
  if (parts.length < 2 || !parts[1]) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}
