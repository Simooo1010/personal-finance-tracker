# App audit — 2026-11-04

This is a source/metadata audit, not a completed whole-app test. No application code, live record, policy or database function was modified. The spec lists the repair order and acceptance gates.

## Coverage and method

Baseline app code `aaa1f5b`; current main `72fe3f6` adds only project instructions/memory. Read all 99 original tracked files: root config/docs/scripts/migrations, all app routes, components, lib files and assets. Source was split between independent UI and server read-only sweeps and primary review of config, shared providers/domain logic/history; generated lockfile was parsed as dependency metadata (630 entries), not treated as handwritten source. No secret environment file read. Fetched/read current upstream instructions and all six playbook documents; current project instructions then adopted. Earlier sweeps used inherited agent settings before newly discovered main-branch model rules were available; subsequent delegation must set model/effort as instructed.

Live checks: GitHub reads, Git fetch, Vercel deployment listing, Supabase table/column/RLS/function metadata. No financial/chat/token rows selected and no RPC invoked. Findings below are source-confirmed control paths or risks, not browser-reproduced bugs unless explicitly stated.

## Prioritized findings

| ID | Priority | Finding and evidence | Regression / acceptance |
| --- | --- | --- | --- |
| A01 | High | AI export writes model HTML and filename into same-origin popup (`app/dashboard/ai-chat/page.tsx:62`). Sanitized Markdown does not protect this path. | Malicious export cannot run script, reach opener/session, or mislabel file format. |
| A02 | High | Transaction/debt forms ignore returned Supabase errors, close and clear drafts (`components/TransactionForm.tsx:120`, `app/dashboard/debts/page.tsx:150`). | Denied/network save retains input, shows failure, retry persists once. |
| A03 | High | Transfer edit uses separate unchecked updates (`activity/page.tsx:174`, `wallets/page.tsx:327`); wallet deletion removes one side's rows and wallet separately (`activity/page.tsx:119`, `wallets/page.tsx:123`). | Forced second-operation failure produces no partial transfer/history; owner-approved deletion semantics preserve ledger integrity. |
| A04 | High | Undo/redo ignores returned database errors, then updates cancellation state; restore returns true even if every undo fails (`lib/actionsTracker.ts:81,99,178`). | Error at each mutation/log step cannot be reported as success; restore stops, reports actual state and recovers safely. |
| A05 | High | In-app AI routes authenticate but do not server-enforce UI email restriction (`app/api/ai/chat/route.ts:134`, `analysis/route.ts:16`). | Non-allowed signed-in request denied before Groq or persistence. |
| A06 | High | OAuth code SELECT then unconditional mark-used is not atomic (`lib/oauth/tokenHandler.ts:47`); registration's confidential-client metadata lacks secret enforcement; refresh ignores client identity. | Parallel exchange yields one success; wrong/missing client authentication and cross-client refresh rejected under chosen protocol. |
| A07 | High | History Edit casts arbitrary/deleted redo payload `{id}` to Transaction; parser dereferences absent title (`app/dashboard/log/page.tsx:44`, `components/TransactionForm.tsx:48`). | Every action kind renders safely; unsupported editing disabled or correctly resolved. |
| A08 | High | Activity delete lacks the confirmation used on Transactions (`app/dashboard/activity/page.tsx:266,498`). | Cancel leaves record intact; intentional confirmation deletes once. |
| A09 | Medium | Core and in-app AI transaction/history reads are unpaginated (`components/TransactionsContext.tsx:35`, `lib/actionsTracker.ts:18`, chat route:205, analysis route:83). Above backend cap, financial totals can omit old records. | Above-cap fixtures produce complete matching totals; failed page reports error, never partial complete result. |
| A10 | Medium | AI memory upsert lacks `onConflict: 'user_id'`, ignores errors and appends each block to stale original (`app/api/ai/chat/route.ts:331`). Model output directly triggers persistence. | Confirmed multi-fact and second/concurrent updates persist without loss; unconfirmed/malformed facts do not write. |
| A11 | Medium | Globally mounted chat provider creates sessions/reassigns orphan messages on dashboard load (`AiChatContext.tsx:69`, dashboard layout:27); no user can leave loading stuck in wallet/chat providers. | Ordinary dashboard load does not write AI data; absent/failed auth settles with recovery and optional AI outage is isolated. |
| A12 | Medium | AI reload redirects before eligibility loading completes (`ai-chat/page.tsx:184`); message/session read errors masquerade as empty; failed reads marked fetched; stream finalization ignores persistence error and EOF without done (`AiChatContext.tsx:125,200,311`). | Deep-link reload remains in chat, failed load retries, truncated/unsaved answer is clearly reported, active-chat deletion loads selected history. |
| A13 | Medium | Missing AI body bounds/schema, no model timeout or cancellation propagation (`chat/route.ts:128,144`, `lib/groq.ts:121,191`). Cache/session read errors ignored before generation. | Null/malformed/oversized input returns controlled 4xx; timeout/stop/concurrent refresh are bounded without hidden writes or duplicate cost. |
| A14 | Medium | Calculator falls back to parseFloat on invalid expression (`Calculator.tsx:232,344`); caller discards standalone result (`activity/page.tsx:602`, `transactions/page.tsx:289`). | `10 / 0` cannot become 10; unary precedence and valid amount handoff tested. |
| A15 | Medium | Analytics one-day x coordinate divides by zero (analytics:382), custom ranges allocate unbounded daily arrays (104,161), summaries disagree about completed debts (53 vs 215), memos omit wallet inputs (310,410,495). | Empty/single-day/long-range/debt/late-wallet fixtures render valid consistent totals within bounds. |
| A16 | Medium | Transfer pair matching uses timestamp alone (`activity/page.tsx:537`, `wallets/page.tsx:581`); generic debt edit duplicates person text (`TransactionForm.tsx:48,94`). | Same-timestamp fixtures select intended pair; repeated debt edit preserves metadata. |
| A17 | Medium | External narrow lookups load all history; chat session counts create N+1 queries (`lib/ai-data/transactions.ts:142`, `chat.ts:55`). REST negative limit becomes negative array slice (`app/api/v1/transactions/route.ts:18`). | Query counts measured/reduced; invalid pagination/dates 400; deterministic complete results. |
| A18 | Medium | No app error boundaries. Optional AI shared initialization and stream updates affect dashboard-wide consumers. | Deliberate page/provider throw or optional service failure leaves core navigation/ledger usable; retries retain drafts. |
| A19 | Medium | Live schema drift includes AI write table and authenticated SECURITY DEFINER RPCs after app revert; base transactions DDL absent; chat session FK does not enforce matching message owner. | Reviewed schema bootstrap and two-owner sandbox tests; explicit residual capability decision; no production mutation during audit. |
| A20 | Medium | Confirmation-required registration may lack a session for initial wallet insert; result ignored (`register/page.tsx:28`). | Sandbox signup/confirmation/login recovers exactly one usable default wallet. Not established by metadata alone. |
| A21 | Medium | Inactive mobile nav lacks accessible names, dialogs lack focus handling, phone lacks logout control; viewport disables zoom (`BottomNav.tsx:43`, `Sidebar.tsx:51`, root layout:41). | Keyboard/screen-reader/zoom and phone logout walkthroughs in both themes. |
| A22 | Low | Manifest references missing `icon-192.png`/`icon-512.png`; blob URLs not revoked; hardcoded wallet legend, emoji slicing. | Asset checks, correct arbitrary wallet labels and safe repeated downloads. |

Relative short references `activity/page.tsx`, `wallets/page.tsx`, etc. in this table mean `app/dashboard/<name>/page.tsx`; component names mean files under `components/` (chat context under `components/ai-chat/`). Line numbers are baseline navigation pointers, not permanent identifiers.

## Automated and real-use evidence

- `npm ci` first attempt produced no output and was cancelled. Bounded retry under Node 24.13.0 / npm 11.6.2 failed EUSAGE: `Missing: @emnapi/runtime@ from lock file`; optional WASM peer warnings preceded it. No lockfile repair/upgrade yet. This is verified in this environment, not proof all npm versions fail.
- Dependencies and `node_modules/next/dist/docs/` are absent. Lint, type checks, build and local app not run; no test runner/script or CI exists in baseline. Old docs mention two lint failures, but they have not been reproduced in this audit and must not be called currently verified.
- Available browser opened the immutable deployed `/login` URL and landed at Vercel login. This verifies the access barrier only. No finance screen, theme, mobile layout or workflow was exercised.
- Owner confirmed no sandbox. All live data create/edit/delete/restore, OAuth consent/token exchange, AI generation/memory persistence, cancellation and real-user performance cases remain untested.
- All public tables have RLS enabled and observed financial policies scope `auth.uid() = user_id`; OAuth tables have no policies. This is metadata evidence, not successful isolation tests.
- No new code, migration, production deployment or merge is part of this documentation checkpoint. Instructions, audit/spec, setup and connection inventory require content/link/full-diff checks and independent review before delivery.

## Next action

Approve/amend `docs/SPEC.md`, resolve sandbox/preview access, then execute its build order autonomously. Start with reproducible installation/test infrastructure; address security and financial integrity before micro-optimizations or new features. Owner-only setup is in `SETUP-FOR-OWNER.md`.
