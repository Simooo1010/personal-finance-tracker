# ONBOARDING.md
Last updated: 2026-10-31 by Claude Code (read-only pass; nothing was executed, no dependencies installed)

## Stack
- TypeScript (`strict: true`), Next.js **16.2.9** App Router, React 19.2.4, Tailwind CSS 4 (`@tailwindcss/postcss`), npm (`package-lock.json`).
- Backend: Supabase (Postgres + Auth + RLS) via `@supabase/ssr` and `@supabase/supabase-js`. No custom server; logic lives in Next route handlers and in the browser.
- UI libs: framer-motion, lucide-react, react-markdown (+ remark-gfm, remark-breaks, rehype-sanitize).
- AI: Groq Cloud chat completions over `fetch` (`lib/groq.ts`, default model `openai/gpt-oss-120b`). External AI access via MCP (`mcp-handler`, `zod`) and a small REST API.
- Hosting: Vercel (README and `lib/oauth/baseUrl.ts` assume it).
- UI language: Italian (`<html lang="it">`, Italian strings throughout). Theme: forced `dark` class.
- `package.json` name is `hopeful-salk` (a leftover; not the product name).

## Entry points
- Web app: `npm run dev` / `build` / `start` (see `package.json`). `.claude/launch.json` defines a `dev` config on port 3000.
- `app/page.tsx`: server component. It calls `supabase.auth.getUser()` and redirects to `/dashboard` or `/login`.
- `proxy.ts` (repo root) exports `proxy()` plus a `matcher`. It refreshes the Supabase session cookies on every non-static request. It redirects unauthenticated `/dashboard*` to `/login` and authenticated `/login` and `/register` to `/dashboard`. [unverified] I believe Next 16 renamed `middleware.ts` to `proxy.ts`, but I couldn't read the Next docs (see Open questions).
- API routes (all `app/api/**/route.ts`):
  - `ai/analysis`, `ai/chat`: in-app AI (Groq).
  - `mcp`: MCP server for Claude.
  - `oauth/{authorize,register,token}` plus `app/.well-known/oauth-*`: a hand-written OAuth 2.1 + PKCE authorization server.
  - `v1/{summary,transactions,wallets,openapi.json}`: REST for ChatGPT Actions.
- One-off scripts at the repo root (not part of the app):
  - `migrate_actions.js`: Node script that tries to run a migration through supabase-js.
  - `update_analytics.py`: a Python script that regex-patches `app/dashboard/analytics/page.tsx`. It looks like a leftover from an earlier edit session.

## Configuration
- No `.env.example` exists. `.gitignore` ignores `.env*`. The README documents a `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required).
  - `SUPABASE_SERVICE_ROLE_KEY`: server only. Required for the OAuth/MCP integration.
  - `GROQ_API_KEY` (optional; the AI routes return `{enabled:false}` if it is missing) and `GROQ_MODEL` (optional).
  - `NEXT_PUBLIC_APP_URL` (optional, otherwise derived from proxy headers) and `MCP_ALLOWED_EMAILS` (optional, comma-separated; defaults to a hardcoded owner email in `lib/oauth/allowlist.ts`).
- Supabase clients (by use):
  - `lib/supabaseClient.ts`: browser client (anon key). Used by nearly all UI code.
  - `lib/supabaseServer.ts`: cookie-bound server client (server components and routes).
  - `lib/supabaseAdmin.ts`: service-role client. Its docblock says it is only for `oauth_*` bookkeeping tables, never for financial data.
- Database schema is applied manually in the Supabase SQL editor, in the `supabase_migration*.sql` files at the root. There is no migration runner and no `supabase/` directory:
  - `supabase_migration.sql`: `wallets`, `transactions.user_id`, RLS.
  - `_actions`: `action_logs`.
  - `_ai`, `_chat`, `_chat_v2`: AI tables.
  - `_oauth`: `oauth_clients`, `oauth_codes`, `oauth_tokens`. RLS is enabled with no policies, so only the service role can touch them.
  - The base `transactions` table's `CREATE TABLE` is not in the repo. Only an `ALTER` exists.
- Lint: ESLint 9 flat config (`eslint.config.mjs`, `next/core-web-vitals` + `next/typescript`). Several rules are turned off: `no-unused-vars`, `no-explicit-any`, `react-hooks/exhaustive-deps`, `set-state-in-effect`.
- `next.config.ts` only sets security headers (nosniff, `X-Frame-Options: DENY`, `X-XSS-Protection`).
- No CI config (no `.github/`), no test runner, no `test` script, no formatter config.
- Fonts: `next/font/google` in `app/layout.tsx`. Bricolage Grotesque is the text font (`--font-bricolage`). Unbounded is for money only (`font-display`, `--font-unbounded`). Never add a font `@import`. This is stated in `CLAUDE.md` and `docs/DESIGN-SYSTEM.md`.

## Architecture (traced flow)
Flow traced: **a logged-in user adds a transaction**, then separately **how an external AI reads the same data**.

### A. Add a transaction (browser, direct to Supabase)
1. Request hits `proxy.ts`. It refreshes the Supabase auth cookies and redirects to `/login` if there is no user.
2. `app/layout.tsx` (server) sets fonts, `lang="it"`, and the `dark` class. `app/dashboard/layout.tsx` is `'use client'`. It wraps everything in nested providers: `WalletProvider` > `TransactionsProvider` > `AiProvider` > `AiChatProvider`. It also renders `Sidebar`, `BottomNav`, and a framer-motion page transition.
3. `WalletProvider` (`components/WalletContext.tsx`) calls `auth.getUser()`, then `getUserWallets()` (`lib/wallets.ts`). That runs `select * from wallets where user_id = …`. `defaultWallet` is the first wallet's slug, falling back to `'generale'`.
4. `TransactionsProvider` (`components/TransactionsContext.tsx`) fetches **all** the user's transactions client-side (`order created_at desc`, no pagination). It re-fetches when `window` fires a `finance_db_changed` event. It exposes `upsertTransaction`, `removeTransaction`, `removeTransactions` for optimistic updates.
5. A page (e.g. `app/dashboard/transactions/page.tsx`, or the dashboard home) opens `components/TransactionForm.tsx`. On save, `handleSave` builds the title as `"<title> [<wallet-slug>]"`. For debts it uses `formatDebtTitle()`: `[DEBT:{json}] [wallet]`. It then runs `supabase.from('transactions').insert({title, amount, type, created_at, user_id}).select()`. RLS (`auth.uid() = user_id`) is the actual authorization.
6. After a successful insert it calls `pushAction(...)` (`lib/actionsTracker.ts`). That inserts an `action_logs` row holding `undo_data` and `redo_data`, then fires `finance_history_change`. `onSaved(saved)` lets the page call `upsertTransaction`.
7. Reading back: `lib/transactions.ts` `parseTransaction()` extracts the wallet from the trailing `[slug]` via regex and debt info from the `[DEBT:{...}]` prefix. `getTransactionEffect()` and `getWalletBalances()` compute balances from those parsed titles. There is **no wallet column** on `transactions`.
8. Undo: `revertToPoint()` loads the history and runs `performSingleUndo()` per action, switching on `action.type` (add/delete/edit transaction, debt, transfer…).
9. Delete (`transactions/page.tsx`): double-tap confirmation (3 s window), optimistic remove, rollback on error, then `pushAction`.

### B. External AI read path (server-side, read-only)
1. Claude connects to `/api/mcp`. A 401 carries `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`. That route returns the resource and authorization-server metadata (RFC 9728).
2. The client registers at `/api/oauth/register`. It then goes to `/oauth/authorize` (a UI page) and `/api/oauth/authorize` (`lib/oauth/authorizeHandler.ts`).
3. At consent, `lib/oauth/allowlist.ts` checks the user's email. It also creates a separate, independent Supabase session for the connector (`lib/oauth/independentSession.ts`), so the app and the connector don't log each other out. Codes and tokens are stored in the `oauth_*` tables via the admin client. PKCE is in `lib/oauth/pkce.ts`. `/api/oauth/token` is handled by `tokenHandler.ts`.
4. On each MCP call, `withMcpAuth` in `app/api/mcp/route.ts` runs `verifyBearerToken` (`lib/oauth/verifyToken.ts`). That looks up the opaque token, refreshes the stored Supabase session if needed, and rejects non-allowlisted users. The result is a `VerifiedSession {userId, clientId, db}`.
5. `db` is a `ReadOnlyDb` from `lib/ai-data/readonly.ts`. It exposes only `from(table).select()`, only on a per-table column allowlist, and forces `.eq('user_id', userId)` on every query. Tools in `lib/ai-data/*` take this wrapper. Every tool is annotated `readOnlyHint`. Output is capped at 100k characters.
6. `app/api/v1/*` (ChatGPT) reuses `requireAuth` and the same `lib/ai-data` layer.

### C. In-app AI (not fully traced)
`components/ai-chat/*` and `AiAnalysisTab` call `app/api/ai/chat` (NDJSON streaming) and `app/api/ai/analysis`. Those call Groq via `lib/groq.ts`. The route builds context from transactions with the same parsers in `lib/transactions.ts`. Only the top of `chat/route.ts` was read.

## Conventions
- Layout: `app/` (routes), `components/` (UI; contexts live beside components), `lib/` (domain logic and clients), `lib/ai-data/` (read-only AI data layer), `lib/oauth/` (auth server), `docs/` (design docs), root `supabase_migration*.sql`.
- Path alias `@/*` maps to the repo root.
- Naming: components and contexts are PascalCase `.tsx`. `lib` files are camelCase `.ts`. Hooks follow `useX`. Route handlers are `route.ts`. Database columns and wallet slugs are snake_case or lowercase.
- Client data pattern: React context providers hold fetched lists, and writes go straight from components to Supabase with the browser client. Cross-component refresh uses `window` custom events (`finance_db_changed`, `finance_history_change`). Optimistic update with rollback on error.
- Error handling: mostly `console.error` plus returning `[]` / `null` / `false`. No error-boundary or toast layer seen. The Groq layer is the exception: it has a `GroqError` class with codes, `NOT_CONFIGURED` handling, and a stream `error` event.
- Defense in depth for AI access: RLS, the read-only wrapper, a column allowlist, an explicit `user_id` filter, a hardcoded email allowlist, and a `read` scope.
- Money: use `components/Money.tsx` for headline amounts. Amounts are stored as numbers and wrapped with `Number()` on read.
- Docs: `CLAUDE.md` says to read `docs/DESIGN-SYSTEM.md` before any UI work and to log design decisions in `docs/DECISIONS.md` the same day. `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing code, because Next 16 differs from training data.
- Dependencies: `claude-project-playbook` (a sibling repo) says to ask before adding dependencies. [unverified] whether that rule applies to this repo, since its `CLAUDE.md` doesn't list one.
- Testing: **none found**. There are no test files, runner, or script. The code mentions injectable dependencies (`VerifyDeps` in `verifyToken.ts`, "fakes in tests"), but I found no tests.
- Language: UI strings and some code comments are in Italian. Docs and most comments are in English.

## Open questions / unverified
- **Next 16 docs unread.** `node_modules` is not installed, so `node_modules/next/dist/docs/` can't be read as `AGENTS.md` requires. Anything I said about `proxy.ts` and Next 16 behaviour is from memory. Install dependencies before writing code and read those docs first.
- **Business rules hidden in titles.** Wallet and debt metadata is encoded in the `title` string (`[slug]`, `[DEBT:{json}]`, and `[slug-transfer]` per the regex). Transfer creation and display were not traced, nor the exact `add_transfer` undo shape. Renaming a wallet slug or editing a title by hand could silently move money between wallets. [unverified] whether anything rewrites titles when a slug is renamed.
- **Debt sign semantics.** In `getTransactionEffect`, an active `to_me` debt (the user lent money) counts as an expense and an active `by_me` debt counts as income. That matches the MCP description in `route.ts`. Whether it matches the intended product behaviour is not confirmed.
- **`transactions` table definition** is not in the repo. Only an `ALTER` adds `user_id`. Its RLS is created in `supabase_migration.sql` and isn't idempotent: it uses plain `CREATE POLICY`.
- **Scalability.** The client fetches every transaction on load, with no pagination.
- **Full-table client reads** also run in `getHistory()` (all `action_logs`).
- **Not read in detail:** `app/dashboard/{page,analytics,debts,activity,log,wallets,ai-chat}`, `components/Calculator`, `components/ai-chat/*`, `lib/ai-data/*` bodies, `lib/groq.ts` bodies, `app/api/ai/*` bodies, `verifyToken.ts` beyond the first 50 lines, and the oauth handlers. Treat claims about them as inferred from names and imports.
- **Stale or misleading files:**
  - `README.md` still carries the `create-next-app` boilerplate (mentions Geist). The fonts are now Bricolage Grotesque and Unbounded.
  - `task.md`'s R1–R8 are all unchecked, although at least the AI chat, analysis, and sparkle icon exist in code.
  - `package.json` name `hopeful-salk`.
  - `update_analytics.py` and `migrate_actions.js` look like one-off leftovers.
- **Known lint errors** (per `docs/DECISIONS.md`): `app/oauth/authorize/page.tsx` (`react-hooks/immutability`) and `migrate_actions.js` (`no-require-imports`). Not re-verified because I did not run lint.
- **Design-system gaps** (from `docs/DESIGN-SYSTEM.md`): dark theme only (`ThemeToggle` exists with no light tokens), two contrast gaps, and some analytics numbers and the calculator don't use `font-display`.
- **Hardcoded personal email** as the default MCP allowlist in `lib/oauth/allowlist.ts` and in `README.md`. Consider whether that should live only in an env var.
- **Missing safety nets:** no CI, no tests, no formatter. "Build must pass before every push" is not enforced by anything in the repo.
- **Sibling repo** `claude-project-playbook` is a documentation template only (`CLAUDE.md`, `SETUP-FOR-OWNER.md`, `docs/WORKFLOW.md`, `docs/SPEC.template.md`, `docs/HOW-TO-WORK-WITH-CLAUDE.md`), with unfilled `<…>` placeholders. It has no code. I did not read `docs/WORKFLOW.md` in full. Its `CLAUDE.md` says to read it every session, so do that if working in that repo.

## Changelog
- 2026-10-31: first pass (Claude Code). Created from scratch. No previous `ONBOARDING.md` existed.
