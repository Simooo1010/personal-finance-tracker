-- =============================================
-- Finance Tracker: AI Integration (MCP / ChatGPT) OAuth
-- =============================================
-- Run this in the Supabase SQL Editor.
--
-- These tables back a minimal OAuth 2.1 + PKCE authorization server that
-- lets external AI clients (Claude via MCP, ChatGPT via Actions) obtain a
-- token scoped to a single app user. They hold no financial data — only
-- OAuth bookkeeping plus the user's Supabase session tokens, so that
-- requests from AI clients can be turned into a normal RLS-scoped Supabase
-- client (no service-role access to financial tables is ever used).
--
-- RLS is enabled with no policies, so only the server (using the
-- SUPABASE_SERVICE_ROLE_KEY, never exposed to the browser) can read/write
-- them.
-- =============================================

-- 1. Registered OAuth clients (Claude, ChatGPT, MCP inspector, ...)
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret TEXT,
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Short-lived authorization codes (PKCE), issued after user consent
CREATE TABLE IF NOT EXISTS public.oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  supabase_access_token TEXT NOT NULL,
  supabase_refresh_token TEXT NOT NULL,
  supabase_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Issued access/refresh token pairs.
--    `expires_at` is our own opaque access_token's lifetime (long-lived, e.g.
--    30 days — the AI client only needs to re-auth via refresh_token after
--    this). `supabase_*` fields are refreshed transparently server-side
--    whenever the underlying Supabase session nears `supabase_expires_at`,
--    without the AI client needing to know.
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  access_token TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supabase_access_token TEXT NOT NULL,
  supabase_refresh_token TEXT NOT NULL,
  supabase_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose: these tables are only ever touched
-- server-side with the service-role key, which bypasses RLS. Browser/anon
-- clients get zero access.

-- Housekeeping: periodically prune expired codes/tokens (run manually or on
-- a schedule — no cost, just keeps the tables small).
-- DELETE FROM public.oauth_codes WHERE expires_at < NOW();
-- DELETE FROM public.oauth_tokens WHERE expires_at < NOW() - INTERVAL '30 days';
