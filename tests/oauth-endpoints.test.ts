import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST as register } from '@/app/api/oauth/register/route'
import { handleAuthorizeRequest } from '@/lib/oauth/authorizeHandler'
import { handleTokenRequest } from '@/lib/oauth/tokenHandler'
import { mintIndependentSession } from '@/lib/oauth/independentSession'
import { createAdminClient } from '@/lib/supabaseAdmin'

vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: vi.fn() }))
vi.mock(import('@/lib/oauth/independentSession'), async importOriginal => ({
  ...await importOriginal(), mintIndependentSession: vi.fn(),
}))

const redirectUri = 'https://client.example.test/callback?existing=1'
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const now = () => Date.parse('2026-11-05T00:00:00Z')
const codeParams = {
  grant_type: 'authorization_code', code: 'test-code', client_id: 'test-client',
  redirect_uri: redirectUri, code_verifier: verifier,
}
const refreshParams = { grant_type: 'refresh_token', refresh_token: 'old-refresh', client_id: 'test-client' }
const consentParams = {
  client_id: 'test-client', redirect_uri: redirectUri, code_challenge: challenge,
  code_challenge_method: 'S256', supabase_access_token: 'browser-token',
  supabase_refresh_token: 'unused-browser-refresh', state: 'original-state',
}

function jsonRequest(body: unknown) {
  return new Request('https://finance.example.test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

function setup(clientSecret: string | null = null, insertError = false) {
  const session = {
    client_id: 'test-client', user_id: 'test-user', supabase_access_token: 'test-session',
    supabase_refresh_token: 'test-session-refresh', supabase_expires_at: new Date(now()).toISOString(),
    expires_at: new Date(now() + 60_000).toISOString(),
  }
  const rows: Record<string, Record<string, unknown>[]> = {
    oauth_clients: [{ client_id: 'test-client', client_secret: clientSecret, redirect_uris: [redirectUri] }],
    oauth_codes: [{ ...session, code: 'test-code', used: false, redirect_uri: redirectUri,
      code_challenge: challenge, code_challenge_method: 'S256' }],
    oauth_tokens: [{ ...session, access_token: 'old-access', refresh_token: 'old-refresh' }],
  }
  // Use the real PostgREST query builder against synthetic rows. Parallel
  // callers see separate read snapshots while each PATCH matches current rows.
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input))
    const table = url.pathname.split('/').at(-1)!
    const tableRows = rows[table]
    const matching = tableRows.filter(row => [...url.searchParams].every(([key, filter]) => {
      if (key === 'select') return true
      const [op, ...value] = filter.split('.')
      if (op === 'eq') return String(row[key]) === value.join('.')
      if (op === 'gt') return String(row[key]) > value.join('.')
      throw new Error(`Unexpected filter: ${op}`)
    }))
    if (init?.method === 'PATCH') {
      for (const row of matching) Object.assign(row, JSON.parse(String(init.body)))
      if (url.searchParams.has('select')) return Response.json(matching)
      return new Response(null, { status: 204 })
    }
    if (init?.method === 'POST') {
      if (insertError) return Response.json({ message: 'private backend error' }, { status: 500 })
      tableRows.push(JSON.parse(String(init.body)))
      return new Response(null, { status: 201 })
    }
    return Response.json(matching)
  })
  const admin = createClient('https://supabase.example.test', 'synthetic-key', { global: { fetch } })
  const getUser = vi.spyOn(admin.auth, 'getUser').mockResolvedValue({ data: { user: {
    id: 'test-user', email: 'test@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '',
  } }, error: null })
  vi.mocked(createAdminClient).mockReturnValue(admin)
  vi.stubEnv('MCP_ALLOWED_EMAILS', 'test@example.test')
  return { admin, rows, fetch, getUser, anon: () => admin, now }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('OAuth registration', () => {
  it.each([null, [], { redirect_uris: [true] }, { redirect_uris: ['ftp://localhost/cb'] },
    { redirect_uris: ['https://client.example.test/cb#'] },
    { redirect_uris: ['https://user:pass@client.example.test/cb'] },
  ])('rejects invalid callback metadata without writing (%j)', async body => {
    const deps = setup()
    expect((await register(jsonRequest(body))).status).toBe(400)
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('registers an explicit public client without storing or returning a secret', async () => {
    const deps = setup()
    const response = await register(jsonRequest({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.token_endpoint_auth_method).toBe('none')
    expect(body).not.toHaveProperty('client_secret')
    expect(deps.rows.oauth_clients[1].client_secret).toBeNull()
  })

  it('defaults to a confidential registration and permits HTTP loopback', async () => {
    const deps = setup()
    const response = await register(jsonRequest({ redirect_uris: ['http://127.0.0.1:3210/callback'] }))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.token_endpoint_auth_method).toBe('client_secret_post')
    expect(body.client_secret).toEqual(expect.any(String))
    expect(deps.rows.oauth_clients[1].client_secret).toBe(body.client_secret)
  })
})

describe('OAuth consent', () => {
  it('rejects non-S256 consent before querying or minting a session', async () => {
    const deps = setup()
    const response = await handleAuthorizeRequest(jsonRequest({ ...consentParams, code_challenge_method: 'plain' }), deps)
    expect(response.status).toBe(400)
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(mintIndependentSession).not.toHaveBeenCalled()
  })

  it('denies only to the registered callback and never mints a code', async () => {
    const deps = setup()
    const response = await handleAuthorizeRequest(jsonRequest({ ...consentParams, decision: 'deny' }), deps)
    expect(response.status).toBe(200)
    const callback = new URL((await response.json()).redirect_url)
    expect(Object.fromEntries(callback.searchParams)).toEqual({ existing: '1', error: 'access_denied', state: 'original-state' })
    expect(mintIndependentSession).not.toHaveBeenCalled()
    expect(deps.rows.oauth_codes).toHaveLength(1)
    const foreign = await handleAuthorizeRequest(jsonRequest({ ...consentParams, decision: 'deny',
      redirect_uri: 'https://foreign.example.test/callback' }), deps)
    expect(foreign.status).toBe(400)
  })

  it('rejects an unsafe callback even if an old client registered it', async () => {
    const deps = setup()
    const unsafe = 'javascript:alert(1)'
    deps.rows.oauth_clients[0].redirect_uris = [unsafe]
    const response = await handleAuthorizeRequest(jsonRequest({ ...consentParams, decision: 'deny', redirect_uri: unsafe }), deps)
    expect(response.status).toBe(400)
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.getUser).not.toHaveBeenCalled()
  })

  it('preserves the callback query and stores an independent session on approval', async () => {
    const deps = setup()
    vi.mocked(mintIndependentSession).mockResolvedValue({
      accessToken: 'independent-access', refreshToken: 'independent-refresh', expiresAtMs: now() + 60_000,
    })
    const response = await handleAuthorizeRequest(jsonRequest(consentParams), deps)
    expect(response.status).toBe(200)
    const callback = new URL((await response.json()).redirect_url)
    expect(callback.searchParams.get('existing')).toBe('1')
    expect(callback.searchParams.get('state')).toBe('original-state')
    expect(deps.rows.oauth_codes[1]).toMatchObject({
      code: callback.searchParams.get('code'), client_id: 'test-client', user_id: 'test-user',
      supabase_refresh_token: 'independent-refresh', code_challenge_method: 'S256',
    })
  })

  it('fails closed when an independent session cannot be minted', async () => {
    const deps = setup()
    vi.mocked(mintIndependentSession).mockResolvedValue(null)
    const response = await handleAuthorizeRequest(jsonRequest(consentParams), deps)
    expect(response.status).toBe(503)
    expect(deps.rows.oauth_codes).toHaveLength(1)
  })
})

describe('OAuth token exchange', () => {
  it.each([null, [], { ...codeParams, code_verifier: 42 }, { ...codeParams, client_id: undefined }])(
    'rejects malformed request data without looking up a code (%j)', async body => {
      const deps = setup()
      expect((await handleTokenRequest(jsonRequest(body), deps)).status).toBe(400)
      expect(deps.fetch).not.toHaveBeenCalled()
    },
  )

  it('permits just one concurrent exchange of an authorization code', async () => {
    const deps = setup()
    const responses = await Promise.all(Array.from({ length: 2 }, () => handleTokenRequest(jsonRequest(codeParams), deps)))
    expect(responses.map(response => response.status).sort()).toEqual([200, 400])
    expect(deps.rows.oauth_tokens).toHaveLength(2)
    expect(responses.find(response => response.ok)?.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rejects duplicate form fields and oversized JSON before contacting the database', async () => {
    const deps = setup()
    const form = new URLSearchParams(refreshParams)
    form.append('client_id', 'other-client')
    const duplicate = new Request('https://finance.example.test', { method: 'POST', body: form })
    expect((await handleTokenRequest(duplicate, deps)).status).toBe(400)
    expect((await handleTokenRequest(jsonRequest({ ...refreshParams, ignored: 'a'.repeat(32 * 1024) }), deps)).status).toBe(400)
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it.each([{ redirect_uri: 'https://client.example.test/callback' }, { code_verifier: 'x'.repeat(43) }])(
    'leaves the code unused when its bindings fail (%j)', async mismatch => {
      const deps = setup()
      const response = await handleTokenRequest(jsonRequest({ ...codeParams, ...mismatch }), deps)
      expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
      expect(deps.rows.oauth_codes[0].used).toBe(false)
      expect(deps.rows.oauth_tokens).toHaveLength(1)
    },
  )

  it('returns a generic error on a failed token insert and never unclaims the code', async () => {
    const deps = setup(null, true)
    const response = await handleTokenRequest(jsonRequest(codeParams), deps)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private backend error')
    expect(deps.rows.oauth_tokens).toHaveLength(1)
    expect((await handleTokenRequest(jsonRequest(codeParams), deps)).status).toBe(400)
  })

  it.each([codeParams, refreshParams])('requires the registered secret for a confidential grant', async params => {
    const deps = setup('registered-secret')
    const unverified = await handleTokenRequest(jsonRequest(params), deps)
    expect(await unverified.json()).toMatchObject({ error: 'invalid_client' })
    const wrongSecret = await handleTokenRequest(jsonRequest({ ...params, client_secret: 'wrong-secret' }), deps)
    expect(await wrongSecret.json()).toMatchObject({ error: 'invalid_client' })
    const verified = await handleTokenRequest(jsonRequest({ ...params, client_secret: 'registered-secret' }), deps)
    expect(verified.status).toBe(200)
  })

  it('binds refresh to the registered public client and rotates the pair once', async () => {
    const deps = setup()
    const foreign = await handleTokenRequest(jsonRequest({ ...refreshParams, client_id: 'foreign-client' }), deps)
    expect(foreign.status).toBe(400)
    const responses = await Promise.all(Array.from({ length: 2 }, () => handleTokenRequest(new Request(
      'https://finance.example.test', { method: 'POST', body: new URLSearchParams(refreshParams) },
    ), deps)))
    expect(responses.map(response => response.status).sort()).toEqual([200, 400])
    expect(deps.rows.oauth_tokens).toHaveLength(1)
    expect(deps.rows.oauth_tokens[0].supabase_refresh_token).toBe('test-session-refresh')
  })
})
