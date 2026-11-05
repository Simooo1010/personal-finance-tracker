# Project memory

Read `instructions.md` and `AGENTS.md` together with this file before every task, whenever scope changes, and before delivery. Follow their delegation, GitHub sync, and repeated automated/real-use testing rules. Update this file with verified important changes and unresolved blockers after meaningful work.

## Baseline inspected 2026-11-04

- Repository: `Simooo1010/personal-finance-tracker`; origin uses GitHub HTTPS.
- Starting commit: `aaa1f5bc975dbdaf88a0e165c169d84be48478f2` (`Revert AI writing changes to previous version`, PR #17). Do not assume reverted AI writing behavior is active.
- `package.json`: Next.js 16.2.9, React 19.2.4, TypeScript, Supabase, Groq-backed AI routes. Available scripts: `dev`, `build`, `start`, `lint`; no test script is currently defined.
- README documents read-only external AI/OAuth integrations and optional Groq configuration. These are repository descriptions, not live verification of deployment, database policies, migrations, or connected accounts.

## Working agreements added 2026-11-04

- `instructions.md` defines subagent delegation: Luna/Terra only for every read-only task, including independent reviews, security audits and running existing checks; Sol for implementation/file writing/test authoring/fixes, rare Astra for exceptionally difficult write tasks at minimum effort only. All subagents are capped at high effort. This routing was explicitly clarified by the owner below.
- `AGENTS.md` links both project context files; agents must read all three and maintain this memory.
- Every feature requires review, automated checks, actual browser use, and repeated fixes/retests until acceptance passes or a precise external blocker is recorded.
- Commit and push reviewed task changes at logical checkpoints; verify remote synchronization and finish the PR/CI loop. No background file watcher is installed by these instructions.

## Verification scope and next work

- This change concerns repository documentation only; no app behavior was changed. App/browser regression testing is not applicable to these text changes.
- Dependencies were absent during initial inspection; no app build, lint, type checks, or runtime behavior has been verified in this session.
- Documentation acceptance: all three files link the required context, model/effort caps are explicit, and delivery/testing rules distinguish evidence from blockers. Independent Sol review identified a documentation-testing scope inconsistency; `AGENTS.md` now explicitly permits documentation-only checks. Sol effort remains proportional to task difficulty, with high as the ceiling rather than a mandatory setting.
- GitHub delivery: the initial sandbox checks reported an invalid CLI token and a DNS failure. A permitted Git push subsequently succeeded using available Git credentials: commit `7eb7574` on `codex/project-working-rules`. Do not treat the initial errors as proof that all GitHub access is unavailable. PR, CI, merge, and deployment remain separate delivery steps.
- Before the next app change, install dependencies, read relevant `node_modules/next/dist/docs/` guides, define acceptance criteria, and establish authorized runtime/sandbox access.

## Reliability audit and playbook adoption — 2026-11-04

- Synced audit baseline to `origin/main` at `72fe3f6`; app code unchanged from `aaa1f5b`. Read all 99 original tracked files through primary and independent UI/server sweeps; lockfile parsed as generated dependency metadata. Current rules were fetched/read when deployment discovery revealed this checkout was behind.
- Owner selected Autonomous mode **after spec approval**, phone/desktop and both themes, confirmed no sandbox, and limited instruction improvements to this finance repo. `docs/SPEC.md` is proposed, not approved; production merge still needs owner OK.
- Adopted the referenced playbook in `docs/WORKFLOW.md` with explicit Codex/Windows/model-rule adaptations; added local instruction rules for quick metadata-only connection discovery and feature isolation. Full findings: `docs/AUDIT.md`; verified service IDs/refs/access limits: `docs/CONNECTIONS.md`; owner-only needs: `SETUP-FOR-OWNER.md`.
- Source-confirmed priorities: unsafe model HTML export, ignored mutation errors/draft loss, non-atomic transfer/undo/restore flows, missing AI server allowlist, OAuth one-use/client validation gaps, invalid history edit payloads, incomplete-history totals and globally coupled optional AI. These are not browser reproductions.
- Live read-only schema/policy/function metadata confirms residual `ai_write_requests` and two authenticated SECURITY DEFINER AI write RPCs after app revert. Functions check auth/ownership and deny anon execution; no RPC invoked. No production data/policy/migration changed; capability reconciliation requires explicit scope decision.
- Clean install blocked in this environment: bounded `npm ci` failed `Missing: @emnapi/runtime@ from lock file` (Node 24.13.0/npm 11.6.2); earlier attempt stalled/cancelled. No dependency repair, lint/type/build/tests yet; installed Next docs absent. Available browser reached Vercel login barrier, not app. No phone/theme/finance workflow/AI generation tested.
- Next: approve/amend spec, establish isolated sandbox and authorized preview, then reproducible baseline/tests and prioritized fixes. Do not claim full QA or implementation complete from this documentation checkpoint.
- Documentation review: independent Sol reviewer found a missing template reference and clarified docs-only gates, fixture privacy and branch prefixes; corrected the local workflow. Local Markdown links and `git diff --check` passed. Application/lockfile behavior unchanged.
- Delivery: draft PR [#19](https://github.com/Simooo1010/personal-finance-tracker/pull/19), branch `codex/app-audit-spec`. Initial commit `de05b35` pushed and matched the connector's PR head. Independent follow-up confirmed all review findings fixed. Vercel preview is a separate hosting check, not automated application regression coverage. No production merge is authorized or performed; spec approval remains next.

## Read-only model routing correction — 2026-11-04

- Owner clarified that all read-only work must use Luna or Terra, never Sol. The earlier Sol documentation reviews above describe what happened, not an approved precedent; they did not follow the intended routing.
- Updated AGENTS, CLAUDE, instructions and WORKFLOW to classify by allowed actions: reviews/security/complex reasoning and existing-check verification remain read-only; reporting findings is not file writing. Sol authors changes/tests/fixes. Mixed tasks should be split. Read-only fallback stays within Luna/Terra; report if both unavailable. No application behavior or spec approval changed.
- Independent read-only Terra review found no routing ambiguity or outstanding findings. Documentation diff checks passed; app tests/browser checks are not applicable to this instruction-only correction. Delivered on the existing draft PR #19; no merge.

## Step 1 baseline checkpoint — 2026-11-05

- Owner approved SPEC and Autonomous implementation. Step branch `codex/step-1-reproducible-baseline` starts from the audit draft. Production merge and schema changes require separate owner authorization.
- Reproduced Windows npm 11.6.2 clean-install failure. Lockfile regeneration recorded missing bundled Tailwind WASM entries. Final lockfile with Vitest passed a fresh isolated Windows install and preserves the previously locked package versions. Added GitHub Actions verification, typecheck and 12 synthetic tests for Rome dates, ledger behavior and PKCE.
- Lint initially reported four pre-existing errors and one warning. OAuth consent now uses the equivalent Location navigation method. The migration helper prints the checked-in SQL without a database client or credentials. Lint, typecheck and tests passed. Next 16.2.9 production build passed with loopback Supabase URL and placeholder public key. A build without these variables fails during prerender.
- Local production-mode browser verified signed-out dashboard redirect, registration link, missing-parameter consent error, and consent return path after reload. Authenticated allow/deny, persisted financial workflows, physical device QA and performance budgets require an isolated backend. Docker and Supabase CLI were absent from PATH. See `docs/SANDBOX-BOOTSTRAP.md` for the replay and profiling proposal. No latency budget has been measured.
- Independent Terra review found no material source issue. Final isolated npm ci resolved the reviewer's lockfile concern on Windows. Linux and preview results belong to the draft PR checks.

## Step 2 security checkpoint — 2026-11-05

- Step 1 is in draft PR #20 stacked on #19. Linux CI reproduced missing optional WASM peers with npm 11.19.1. Four lockfile entries plus peer metadata resolved it without changing existing versions. Windows clean install, Linux Actions and Vercel preview passed at `3dd3571`.
- Owner chose a dedicated ledger test account and personal-account AI checks with cleanup. Await the confirmation address. Database migration rehearsals and concurrent PostgreSQL tests still need an isolated backend. AI checks need a disposable chat and verified recovery for any cache or memory changes.
- Owner clarified that Luna/Terra also handle low-stakes and low-effort tasks that edit files, as well as all read-only work and research. Updated AGENTS, CLAUDE, instructions and WORKFLOW. The sandbox documentation assignment earlier in this turn used Sol and should have used Luna or Terra.
- Owner reaffirmed that model and effort selection should follow an assessment of each assignment. Instructions now require inspecting the scope, risks, and checks before assigning work, recording the reason, and raising effort only for a concrete need.
- Step 2 branch adds REST validation, bounded AI request and provider handling, scoped AI authorization, safe downloadable reports, and OAuth callback, client and PKCE validation. AI concurrency is scoped to one instance. OAuth uses a conditional code claim and separate token insertion. A failed insert requires fresh consent. Older public clients registered with a stored secret need to re-register with explicit public authentication.
- The connector clients, personal AI, logged-in export, and real database concurrency checks remain pending. No residual RPC privileges were changed. Dedicated independent Step 2 review could not start because the subagent thread limit was reached. Parent reviewed the integration and ran automated checks.
