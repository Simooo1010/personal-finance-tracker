import { describe, expect, it } from 'vitest'
import { verifyPkce } from '../lib/oauth/pkce'

// Published example from RFC 7636 Appendix B.
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('PKCE verification', () => {
  it('accepts the published S256 test vector', () => {
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true)
  })

  it('rejects a wrong verifier and unsupported challenge methods', () => {
    expect(verifyPkce(`${verifier}x`, challenge, 'S256')).toBe(false)
    expect(verifyPkce(verifier, verifier, 'unsupported')).toBe(false)
  })
})
