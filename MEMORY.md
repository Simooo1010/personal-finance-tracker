# AI finance writes: handoff (2026-11-04)

Read AGENTS.md and CLAUDE.md before resuming. Read docs/DESIGN-SYSTEM.md before UI edits. This file records work status, not proof of successful end-to-end verification.

## User requirements and authorization

The user requests complete create/edit/delete access to app data through Sparkle, with a structured preview and explicit confirmation before each write. Read access should stay available without confirmation. Include names, amounts, dates, descriptions, notes, wallets, debts, transfers, and memory where supported. Every executed AI change must appear in activity history. Confirmed proposals must remain visibly completed after reopening. Verify balances and summaries after changes. Follow the review/test/fix/retest loop in AGENTS.md. Push, CI and merge are authorized. The user has also authorized testing through their profile if a usable browser/login becomes available; prefer disposable data and avoid altering existing personal records for tests.

## Delivered

- PR #14 merged: structured signed user-bound finance commands, confirmation endpoint and generic atomic/idempotent RPC. Supports transaction, debt, transfer, wallet CRUD and explicit memory replacement. Optimistic snapshots are checked at execution.
- PR #15 merged: recognize ordinary JSON fences containing an action wrapper; normalize database rows before strict validation; identify target in edit preview.
- PR #16 merged: hide action JSON in historical messages; expose wallet IDs in model context; fix debt description/type mapping; record confirmation-status permission migration. Main commit: c1a1671772648f6bc28c88172b46b2add2d2e61e.
- Focused existing tests, TypeScript and targeted ESLint passed for these changes. Vercel PR builds passed. These are not authenticated browser verification.

## Supabase changes already applied

Project: aedoncqvypsrksnqiwgh (Personal finance tracker).

- Removed the existing transactions policy named "Allow all access" (public ALL USING true). Owner policies remain.
- Applied supabase_migration_ai_writes.sql, creating ai_write_requests and execute_ai_write_once(uuid,jsonb), plus legacy create_ai_transaction_once.
- Applied ai_confirmation_status_read: grant SELECT(user_id, request_id) to authenticated and an owner-only SELECT policy. The earlier client query could not read this table, causing completed cards to appear pending. Permissions verified by SQL; app reopening still untested.

## Outstanding work (do not claim complete)

1. Add atomic activity logging for ALL successful AI writes, including before/after details and request ID; no duplicate entry on retry. Current RPC does not log to action_logs. Existing undo/redo code supports only known legacy transaction/debt/transfer shapes; do not create misleading restore behavior for generic AI actions.
2. Add a real notes field if implementing notes: transactions currently contain id, user_id, title, amount, type, created_at, with wallet/debt/transfer metadata encoded in title. No standalone notes field exists in schema/form.
3. Complete field coverage and review preparation paths. Transfer description update is mentioned in prompt but absent from its schema. Wallet update constructs after by spreading current (including id), whereas walletRecordSchema is strict and lacks id; review/fix. Transfer pairing currently accepts expense source only; wallet deletion encountering incoming transfer can fail. Audit SQL wallet slug extraction for -transfer suffix and wallet deletion snapshot coverage/concurrency before claiming safe complete behavior.
4. Robust JSON protocol handling and tests: current stream filter accepts only exact fence tags and limited wrapper shape. Historical cleanup handles ordinary JSON with action/type shapes. Need regression tests for chunk boundaries, malformed/truncated/wrapped JSON, successful card generation, and old messages. Do not turn unsigned historical JSON into executable cards.
5. Verify edit/delete/create affect all balances/analytics and debts correctly. No real usage verification has been completed. Use meaningful automated tests plus actual UI actions, reload/navigation, duplicate confirmations, stale proposals, and mobile layout.
6. Confirmation history uses message HTML marker after fetching request IDs. Review error handling and per-proposal status; current message-level completed marker is coarse. SQL permissions fix is live but reopening behavior not verified in app.

## Environment and verification limitations

- Latest tool discovery exposed Supabase but no browser js/CUA tool. Runtime status reports remote desktop capability enabled, state unknown, but capability is not a callable browser tool. Browser skill requires its authorized tools; do not claim UI testing based on HTTP fetch.
- Latest runtime status: restricted package-manager network policy, no configured secrets/runtime variables/outbound identities. User believes full Internet is enabled; recheck observed status before relying on it.
- Chromium and Playwright are installed locally, but Browser skill prohibits substituting standalone shell/Playwright for its tool.
- No usable login credential found. Do not dump environment variables or secret contents; inspect only authorized credential metadata. Do not reset user's password to obtain access.
- Local build previously failed downloading existing Google Fonts due network; Vercel build passed. Full lint has pre-existing OAuth immutability errors and migrate_actions.js require-import errors.
- No Instructions.md or Memory.md existed when searched; this MEMORY.md is the new handoff. CLAUDE.md references AGENTS.md.

## Relevant files

lib/aiActionSchema.ts, lib/aiActionPreparation.ts, lib/aiActions.ts; app/api/ai/chat/route.ts; app/api/ai/actions/confirm/route.ts; components/ai-chat/AiChatContext.tsx; app/dashboard/ai-chat/page.tsx; lib/actionsTracker.ts; app/dashboard/log/page.tsx; lib/transactions.ts; supabase_migration_ai_writes.sql; supabase_migration_ai_confirmation_status.sql.

Vercel project prj_PXOAkTwzqrdO7UG6z2mrqHWg5dtn, team team_7cA5Y1PcLGxH0Rcb6HXHzwHx. Production domain personal-finance-tracker-brown.vercel.app. Recheck live deployment before reporting current readiness.
