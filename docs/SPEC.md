# SPEC — Finance Tracker reliability and growth

Status: approved for Autonomous delivery on 2026-11-05. Production migration and merge require separate owner authorization. Read with `docs/WORKFLOW.md`, `AGENTS.md`, `instructions.md`, `docs/AUDIT.md`, and the design system.

## 1. Goal

Make the existing personal finance app reliable on phone and desktop in light and dark themes before adding many new features. Preserve current Italian workflows and financial semantics unless a separate decision explicitly changes them. Users must be able to manage income, expenses, wallets, transfers and debts without silent loss, partial writes, misleading totals or duplicate effects. Optional AI, exports, and analytics failures must leave core navigation and the ledger usable.

Done means accepted user workflows, regression tests, lint, type checks, production build, independent review, real sandbox browser walkthroughs, and documented preview/CI status. Missing access is a blocker, not a pass. No claim that every possible defect is eliminated.

## 2. Data

Source: connected Supabase project `aedoncqvypsrksnqiwgh` (production/personal; metadata reads only). Names below verified from public schema on 2026-11-04. The new sandbox is not established. Do not infer schema from old onboarding notes.

| Table | Exact fields | Reads | Existing writes / safety |
| --- | --- | --- | --- |
| `transactions` | `id`, `created_at`, `title`, `amount`, `type`, `user_id` | Core ledger, analytics, AI context | Manual create/edit/delete/revert; type is `income` or `expense`. Live `user_id` nullable. Wallet/debt/transfer metadata currently encoded in `title`. |
| `wallets` | `id`, `user_id`, `slug`, `name`, `description`, `position`, `created_at` | Wallet selection and balances | User-managed wallets; prevent orphan or unmatched transfer effects. |
| `action_logs` | `id`, `user_id`, `created_at`, `type`, `label`, `undo_data`, `redo_data`, `is_cancelled` | History / restore | Log only verified operations; validate payload shapes and stop restore on failure. |
| `ai_analysis` | `id`, `user_id`, `first_generation_time`, `last_generation_time`, `last_auto_generation_time`, `analysis_text`, `created_at` | Analysis cache | Optional server-generated cache; authorize, deduplicate and report errors. |
| `chat_sessions` | `id`, `user_id`, `title`, `created_at`, `updated_at` | Chat history | Explicit user chat workflow; no session creation from ordinary dashboard mount. |
| `chat_messages` | `id`, `user_id`, `role`, `content`, `created_at`, `session_id` | Chat history | User/assistant messages; session and message owner must match. Role is `user` or `assistant`. |
| `user_ai_memory` | `id`, `user_id`, `memory_text`, `updated_at` | AI context | Model text alone must not authorize memory writes; explicit reviewed confirmation required for new memory updates. |
| `oauth_clients` | `client_id`, `client_secret`, `client_name`, `redirect_uris`, `created_at` | OAuth bookkeeping only | Server only. No values read for this audit. |
| `oauth_codes` | `code`, `client_id`, `user_id`, `redirect_uri`, `code_challenge`, `code_challenge_method`, `supabase_access_token`, `supabase_refresh_token`, `supabase_expires_at`, `expires_at`, `used`, `created_at` | OAuth bookkeeping only | Server only; atomically consume once. No values read. |
| `oauth_tokens` | `access_token`, `refresh_token`, `client_id`, `user_id`, `supabase_access_token`, `supabase_refresh_token`, `supabase_expires_at`, `expires_at`, `created_at` | OAuth bookkeeping only | Server only; enforce supported client authentication and rotation. No values read. |
| `ai_write_requests` | `user_id`, `request_id`, `transaction_id`, `created_at`, `result` | Residual live schema only | No new writes/calls in this scope. Reconcile retained RPCs explicitly before modifying capabilities. |

RLS is enabled on all listed public tables. This does not replace two-user ownership tests. OAuth tables have no public RLS policies. Service role remains restricted to OAuth bookkeeping; never use it to bypass financial ownership.

Keep the existing external MCP/REST interface read-only. Do not reintroduce reverted AI finance writing. Repository SQL is incomplete and differs from live schema; prepare reviewed versioned migrations with rollback/backup notes, test in isolation, then seek specific authorization for production application. No production schema writes in this proposal's autonomous execution.

## 3. Acceptance from real use

Each step adds a regression test for each fixed defect and walks through affected UI using disposable sandbox data. Verify persisted results after reload, not only local state. Fixtures may be synthetic inside tests; do not export real financial/chat records into the repo.

| Area | Successful path | Mistakes, cancellation, retry and recovery |
| --- | --- | --- |
| Auth | Sign in, reload a deep link, sign out on phone and desktop | Invalid credentials, email-confirmation signup, expired/revoked session and default-wallet recovery; no endless loading. |
| Transactions/debts | Create/edit amounts and dates, complete/reopen debt, reload and compare all balances | Invalid/empty input, denied/network error retains draft; cancel writes nothing; duplicate submit applies once; failed history write is surfaced accurately. |
| Transfers/wallets | Paired movements remain balanced after create/edit/delete/restore | Same/missing wallet, insufficient balance under current rules, same-timestamp transfers, concurrent edit, failed second operation and duplicate retry; no partial pair or silent cash change. Define wallet deletion's effect before implementing it. |
| History | Undo/redo/restore every supported action type and verify persistence | Unsupported/malformed/deleted record edit never crashes; intermediate failure stops safely and reports actual state; retry and double tap do not repeat applied effects. |
| AI | Authorized user opens chat directly, sends/stops, returns to session; analysis cache loads | Disabled/no key/non-allowed user cannot invoke model; malformed input, stream loss, failed save, timeout, cancellation and concurrent refresh recover; ordinary dashboard load makes no AI writes. Memory changes require explicit confirmation. |
| Exports | Supported file opens correctly with accurate contents | Model filename/HTML/formulas are untrusted; no same-origin script/opener execution, misleading XLSX label, leaked blob URLs, or unsafe spreadsheet cells. |
| Analytics | Totals agree with Home/Debts/ledger for the same inputs | Empty data, completed debt, transfers, one-day/reversed/long range, DST, late wallet load and many wallets; no NaN chart or unbounded allocation. |
| Isolation | Inject one optional feature rendering/network failure; navigate to core ledger and recover | Show local error/retry, preserve drafts, avoid global unhandled rejection; report stale data explicitly rather than showing zero. Boundaries must contain providers too, not just page children. |
| Access | Two test users can read/write only their own allowed records | Foreign session IDs, undo payloads, RPCs, direct API calls and disabled AI access fail without side effects. |

Both themes and phone/desktop require screenshots for changed UI; include keyboard names, focus behavior, reduced motion and zoom. Owner supplies real-device verification; agent browser emulation does not count as a physical-phone test.

## 4. Performance and feature boundaries

Measure the baseline with repeatable test fixtures at small and above-row-cap history sizes, the same build and throttling. Record route-change latency, long tasks, render work, request counts, payload size and full-history correctness. Report median/tail and before/after conditions; do not use historical claimed numbers as current measurements.

First fix correctness-preserving pagination, repeated full-history/N+1 requests, unbounded date ranges and unnecessary global AI initialization. Keep parsed domain calculations pure and shared across screens; memoize stable inputs only where measured. Defer schema normalization, caching, state-library replacements and major UI redesign to separately approved specs. Define regression budgets from measured baseline in step 1; no invented target presented as measured.

Add feature-specific error containment and retry UI; shared auth/ledger providers cannot depend on AI session setup. Request timeouts/cancellation and explicit terminal streaming states prevent a broken optional service hanging core use. Introduce a small write/data boundary and transaction-safe server/database operations where required, while preserving ownership and confirmation. Never rely on model assertions, disabled buttons, or client metadata as write authority.

## 5. Build order

Each step is separately reviewable, testable and shippable on a `codex/` branch. Autonomous mode permits continuation within the approved spec when required gates pass. A missing prerequisite blocks dependent checks only; finish independent work and record the gap.

1. **Reproducible baseline and safety net.** Repair the verified clean-install failure without speculative dependency upgrades; read installed Next 16.2.9 guides. Add Vitest for pure logic, typecheck/test commands and CI, regression fixtures and sandbox schema bootstrap proposal. Capture baseline and set justified performance budgets. Check: clean install, lint/type/build/tests, agreed failing reproductions, no secret or personal data fixtures.
2. **Security and access.** Validate AI/OAuth/REST inputs, enforce AI server allowlist, isolate HTML exports, fix OAuth code/client semantics, bound cost/concurrency/cancellation. Inspect residual live RPCs and propose explicit retention/revocation; no production change without separate authorization. Check: bad/foreign requests have no side effects, token races mint once, exports cannot execute privileged content, stop terminates work.
3. **Financial write integrity.** Retain failed drafts; handle resolved and thrown errors; centralize validated mutation results, action payloads and retry guards. Implement atomic transfer/restore operations in sandbox with ownership and idempotency. Resolve wallet-deletion semantics before coding that path. Check: forced intermediate failures leave invariant balances/history; restore never falsely reports success; reload confirms exactly one effect.
4. **Contain feature failures.** Scope optional AI initialization and state, remove implicit page-mount writes, fix chat reload/history/persistence, handle no-user states, add error boundaries and recovery for page and provider failures. Check: AI outage or deliberate throw leaves navigation/ledger usable and drafts intact; retries succeed without duplicates.
5. **Accurate and faster reads.** Deterministic pagination shared where appropriate; eliminate verified full-history/N+1 waste, stabilize expensive derived data, fix analytics ranges/debt consistency and calculator parsing/handoff. Check: totals match above row cap; one-day charts valid; measured before/after improvement within agreed budgets with no correctness loss.
6. **Whole-app QA and delivery.** Phone/desktop, both themes, keyboard/focus/zoom, missing icons, all screen workflows and important failure paths. Independent review by an agent that did not implement each change; fix/retest findings. Draft PR per pushed branch, required CI green, concrete preview checklist and owner acceptance. Production merge only after owner OK.

## 6. Decisions and unresolved choices

| Date | Decision | Decided by | Sections |
| --- | --- | --- | --- |
| 2026-11-04 | Read all repository source before edits; adopt referenced playbook locally; audit reliability, performance and feature isolation | Owner | all |
| 2026-11-04 | Autonomous mode after spec approval; phone and desktop, light and dark | Owner | 1, 3, 5 |
| 2026-11-04 | Existing Supabase project has no sandbox | Owner | 2, 3 |
| 2026-11-04 | Instruction improvements apply to finance app only; no upstream playbook PR | Owner | all |
| 2026-11-05 | Approved the spec and authorized implementation in Autonomous mode | Owner | all |

Before the affected implementation: decide a sandbox strategy without unapproved spending; agree what deleting a wallet should do to paired transfers and how it is confirmed; choose whether residual AI RPCs are retained or revoked; record test device/browser. Preserve existing behavior elsewhere. New features, major schema normalization, or changed debt semantics require a later spec change.
