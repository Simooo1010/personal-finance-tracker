# Project memory

Read `instructions.md` and `AGENTS.md` together with this file before every task, whenever scope changes, and before delivery. Follow their delegation, GitHub sync, and repeated automated/real-use testing rules. Update this file with verified important changes and unresolved blockers after meaningful work.

## Baseline inspected 2026-11-04

- Repository: `Simooo1010/personal-finance-tracker`; origin uses GitHub HTTPS.
- Starting commit: `aaa1f5bc975dbdaf88a0e165c169d84be48478f2` (`Revert AI writing changes to previous version`, PR #17). Do not assume reverted AI writing behavior is active.
- `package.json`: Next.js 16.2.9, React 19.2.4, TypeScript, Supabase, Groq-backed AI routes. Available scripts: `dev`, `build`, `start`, `lint`; no test script is currently defined.
- README documents read-only external AI/OAuth integrations and optional Groq configuration. These are repository descriptions, not live verification of deployment, database policies, migrations, or connected accounts.

## Working agreements added 2026-11-04

- `instructions.md` defines subagent delegation: Luna/Terra for read-only or low-stakes work, Sol for substantive writing/testing/fixes, rare Astra at minimum effort only. All subagents are capped at high effort.
- `AGENTS.md` links both project context files; agents must read all three and maintain this memory.
- Every feature requires review, automated checks, actual browser use, and repeated fixes/retests until acceptance passes or a precise external blocker is recorded.
- Commit and push reviewed task changes at logical checkpoints; verify remote synchronization and finish the PR/CI loop. No background file watcher is installed by these instructions.

## Verification scope and next work

- This change concerns repository documentation only; no app behavior was changed. App/browser regression testing is not applicable to these text changes.
- Dependencies were absent during initial inspection; no app build, lint, type checks, or runtime behavior has been verified in this session.
- Documentation acceptance: all three files link the required context, model/effort caps are explicit, and delivery/testing rules distinguish evidence from blockers. Independent Sol review identified a documentation-testing scope inconsistency; `AGENTS.md` now explicitly permits documentation-only checks. Sol effort remains proportional to task difficulty, with high as the ceiling rather than a mandatory setting.
- GitHub delivery: the initial sandbox checks reported an invalid CLI token and a DNS failure. A permitted Git push subsequently succeeded using available Git credentials: commit `7eb7574` on `codex/project-working-rules`. Do not treat the initial errors as proof that all GitHub access is unavailable. PR, CI, merge, and deployment remain separate delivery steps.
- Before the next app change, install dependencies, read relevant `node_modules/next/dist/docs/` guides, define acceptance criteria, and establish authorized runtime/sandbox access.
