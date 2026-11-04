# Project working instructions

## Read first

Every main agent and subagent must read `AGENTS.md`, `instructions.md`, and `MEMORY.md` before working. Revisit them when scope changes and before delivery. Follow more specific directory instructions too. These files describe this repository; do not confuse project memory with the assistant's private memory or the app's AI memory.

## Delegate deliberately

The main agent coordinates app work through subagents, assigns bounded tasks with acceptance criteria, and remains responsible for integration and verified results. Use subagents for investigation, implementation, testing, review, and fixes when tools support them. Parallelize independent tasks; give each writer exclusive ownership of its files. If delegation is unavailable, record that limitation and continue the authorized work.

Choose the least expensive suitable available model and set both model and reasoning effort explicitly:

| Work | Model | Effort |
| --- | --- | --- |
| Simple read-only inspection, searches, summaries, low-stakes checks | Luna (`gpt-6-luna`) | low; medium if needed |
| Broader read-only investigation or bounded low-stakes work | Terra (`gpt-6.1-terra`) | low or medium; high only when justified |
| Implementation, writing, substantive tests, fixes, security review, complex reasoning | Sol (`gpt-6.1-sol` or available Sol variant) | low, medium, or high according to difficulty |
| Rare, exceptionally difficult issue remaining after cheaper attempts | Astra (`gpt-6-astra`) | lowest supported effort only (currently low); never medium or high |

Never give any subagent effort above high. Never use Astra routinely. If a listed model is unavailable, use an available suitable model within these caps and report the substitution. Read-only agents must not edit files or mutate external data. Require evidence, file references, checks, and unresolved issues in handoffs; independently verify claims before integration or writes.

## Acceptance and repeat-until-working loop

Before implementation, record the expected visible behavior, success path, and relevant error, cancellation, retry, recovery, and duplicate-action cases. Then implement, review the code and full diff, run focused tests and relevant regression tests, lint, type checks, and a production build when available. Follow `AGENTS.md` for the full required loop and read the installed Next.js guides before changing app code.

Testing also means using the running app as a person. Use the user's authorized Chrome browser/extension when available, or another supported browser/computer-use tool. Type, click, cancel, retry, navigate away and back, and reload. Verify resulting UI and persisted data; check mobile layouts for UI changes. Browser access is authorized for this testing, but use a sandbox account and disposable data for writes. Existing product confirmation, authorization, and ownership checks still apply; personal or production test records need specific authorization.

Whenever review, automated checks, or real use reveals a defect: fix it, rerun affected checks and regression coverage, and exercise the app again. Repeat until all acceptance criteria pass. Do not claim perfection or real-use success from code review or a build alone. If access, credentials, dependencies, a migration, or a sandbox is missing, finish independent work and record exactly what remains untested and what would unblock it. Documentation-only changes require link/content/diff review; app tests and browser flows may be marked not applicable with that reason.

## Keep GitHub synchronized

For every local change, include all task-owned files in a reviewed commit and push to the repository's working branch at each completed logical checkpoint and before handoff. This is an agent delivery obligation, not an installed background watcher or a push on each keystroke. Check status and branch first; create a `codex/` branch from detached HEAD when permitted. Preserve unrelated user work and never commit secrets, credentials, environment files, generated artifacts, or unreviewed changes.

Use normal pushes, never force-push or bypass protections. Open or update a PR, wait for required CI, address failures/review findings in the same loop, and merge only when required checks and repository protections permit it. Verify the remote commit matches the delivered local commit. If commit, push, PR, CI, merge, or deployment is blocked, retain local work and report the exact unsynced state and blocker; never claim a local edit was synced. This standing instruction authorizes routine commits, pushes, and PR updates for requested project work.

## Maintain project memory

Update `MEMORY.md` after meaningful work with important app changes, decisions and reasons, verified checks and real-use coverage, known failures, and the next required action. Keep it concise and factual, distinguish repository evidence from live verification, and retain unresolved blockers until resolved. Include commit/PR references when known; never store secrets or personal financial data. Both this file and `MEMORY.md` must continue to direct agents to read each other and `AGENTS.md`.
