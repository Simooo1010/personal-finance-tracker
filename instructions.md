# Project working instructions

## Read first

Every main agent and subagent must read `AGENTS.md`, `instructions.md`, and `MEMORY.md` before working. Revisit them when scope changes and before delivery. Follow more specific directory instructions too. These files describe this repository; do not confuse project memory with the assistant's private memory or the app's AI memory.

Also read `CLAUDE.md`, `docs/WORKFLOW.md`, and the current `docs/SPEC.md`. Follow the adopted playbook every session. Owner chose Autonomous mode after spec approval, phone/desktop and both themes, and finance-app-only instruction updates on 2026-11-04. Never treat a draft spec or approval-mode choice as approval to implement it. Production merge needs owner OK.

## Discover connections quickly

Start with `docs/CONNECTIONS.md` and the Git remote. Batch independent read-only checks of GitHub branch/PR state, Vercel deployment commit, and Supabase project/schema; do not make the owner repeat information available through connectors. Use known project IDs and purpose-built tools instead of broad account scans or UI navigation. Keep one dated evidence table with service, project, commit/environment, access actually tested, and blockers. Stop discovery when the next action is supported; refresh only changed or relevant facts.

Store identifiers, names and verification dates only. Never copy tokens, environment values, OAuth code/token rows, financial records, or personal data into connection docs or logs. Connection listings are not proof of a usable browser login or sandbox. Inspect metadata first; do not invoke stored functions to test connectivity. If access expires, record it and request reconnection instead of retrying indefinitely. Preserve the distinction between application rollback and database rollback: compare deployed migrations, policies and RPCs when code is reverted.

## Keep features contained

Build data access and pure domain logic before UI. Keep shared ledger/auth providers independent of optional AI, exports, or analytics initialization. No implicit write just from visiting a page. Validate inputs and model output at each write boundary, authorize ownership server-side/RLS, and require the product's confirmation before consequential actions. A hidden button is not authorization.

Use feature error boundaries with useful retry/navigation, explicit loading/error/empty states, bounded requests with cancellation, and a recovery path that retains unsaved input. A failed fetch must not become a zero balance or an empty account. Paginate with deterministic ordering; refuse to present incomplete totals as complete. Profile before/after with the same dataset, device and build; avoid speculative caches or disabling checks to make results look faster.

Treat transfers and multi-record restores as atomic operations, with idempotent retries and concurrency checks where needed. Check both returned database errors and thrown exceptions. Do not record success, close a draft, or mark history reverted until the write is verified. Each fixed bug gets a regression test; exercise failure, duplicate-click, cancel, reload, and recovery paths. Keep fixtures synthetic or anonymized inside tests, never production seed data. No database migration or schema normalization as incidental cleanup.

## Delegate deliberately

The main agent coordinates app work through subagents, assigns bounded tasks with acceptance criteria, and remains responsible for integration and verified results. Use subagents for investigation, implementation, testing, review, and fixes when tools support them. Parallelize independent tasks; give each writer exclusive ownership of its files. If delegation is unavailable, record that limitation and continue the authorized work.

Classify by the actions authorized in the assignment, not the topic's difficulty or importance. **Every read-only task must use Luna or Terra, never Sol or Astra.** This includes independent code/documentation/security reviews, audits, complex analysis, planning recommendations, searches, summaries, and verification that only inspects or runs existing checks without changing application/external data. Returning findings in a message is read-only; it is not a writing assignment. Creating/editing source, tests, documentation, configuration or external records is write work. Incidental test/build artifacts do not turn verification into implementation.

Choose the least expensive suitable allowed model and set both model and reasoning effort explicitly:

| Work | Model | Effort |
| --- | --- | --- |
| Simple read-only inspection, searches, summaries, low-stakes checks | Luna (`gpt-6-luna`) | low; medium if needed |
| Broader/complex read-only investigation, independent code/documentation/security review, audit, existing-check verification | Terra (`gpt-6.1-terra`) | low or medium; high only when justified |
| Implementation, file/document writing, authoring tests, fixes, authorized external mutations | Sol (`gpt-6.1-sol` or available Sol variant) | low, medium, or high according to difficulty |
| Rare, exceptionally difficult write task remaining after cheaper attempts | Astra (`gpt-6-astra`) | lowest supported effort only (currently low); never medium or high; never read-only work |

Never give any subagent effort above high. Never use Astra routinely. For read-only work, substitute Luna and Terra only for each other; if neither is available, report the limitation rather than silently selecting Sol/Astra. Split mixed assignments into read-only investigation/review (Luna/Terra) and implementation (Sol) when practical. A reviewer reports findings; a separate writer applies fixes. Do not broaden a review into write work merely to justify Sol. For write tasks, other suitable substitutions must stay within the effort caps and be reported. Read-only agents must not edit files or mutate external data. Require evidence, file references, checks, and unresolved issues in handoffs; independently verify claims before integration or writes.

## Acceptance and repeat-until-working loop

Before implementation, record the expected visible behavior, success path, and relevant error, cancellation, retry, recovery, and duplicate-action cases. Then implement, review the code and full diff, run focused tests and relevant regression tests, lint, type checks, and a production build when available. Follow `AGENTS.md` for the full required loop and read the installed Next.js guides before changing app code.

Testing also means using the running app as a person. Use the user's authorized Chrome browser/extension when available, or another supported browser/computer-use tool. Type, click, cancel, retry, navigate away and back, and reload. Verify resulting UI and persisted data; check mobile layouts for UI changes. Browser access is authorized for this testing, but use a sandbox account and disposable data for writes. Existing product confirmation, authorization, and ownership checks still apply; personal or production test records need specific authorization.

Whenever review, automated checks, or real use reveals a defect: fix it, rerun affected checks and regression coverage, and exercise the app again. Repeat until all acceptance criteria pass. Do not claim perfection or real-use success from code review or a build alone. If access, credentials, dependencies, a migration, or a sandbox is missing, finish independent work and record exactly what remains untested and what would unblock it. Documentation-only changes require link/content/diff review; app tests and browser flows may be marked not applicable with that reason.

## Keep GitHub synchronized

For every local change, include all task-owned files in a reviewed commit and push to the repository's working branch at each completed logical checkpoint and before handoff. This is an agent delivery obligation, not an installed background watcher or a push on each keystroke. Check status and branch first; create a `codex/` branch from detached HEAD when permitted. Preserve unrelated user work and never commit secrets, credentials, environment files, generated artifacts, or unreviewed changes.

Use normal pushes, never force-push or bypass protections. Open or update a PR, wait for required CI, address failures/review findings in the same loop, and merge only when required checks and repository protections permit it. Verify the remote commit matches the delivered local commit. If commit, push, PR, CI, merge, or deployment is blocked, retain local work and report the exact unsynced state and blocker; never claim a local edit was synced. This standing instruction authorizes routine commits, pushes, and PR updates for requested project work.

## Maintain project memory

Update `MEMORY.md` after meaningful work with important app changes, decisions and reasons, verified checks and real-use coverage, known failures, and the next required action. Keep it concise and factual, distinguish repository evidence from live verification, and retain unresolved blockers until resolved. Include commit/PR references when known; never store secrets or personal financial data. Both this file and `MEMORY.md` must continue to direct agents to read each other and `AGENTS.md`.
