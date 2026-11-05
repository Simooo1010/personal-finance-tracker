@AGENTS.md

## Working method and owner choices
- Read `instructions.md`, `MEMORY.md`, `docs/WORKFLOW.md`, and `docs/SPEC.md` every session and before each step. The workflow is adopted from `Simooo1010/claude-project-playbook`; do not modify that upstream repo for this task.
- **Approval mode: Autonomous.** The owner approved `docs/SPEC.md` on 2026-11-05.
- **Production merge: owner OK required.** Routine reviewed commits, pushes, and draft PRs are authorized by `instructions.md`.
- **Acceptance devices:** phone and desktop, light and dark themes. Specific phone/browser remains to be recorded when owner testing begins.
- **Data:** Supabase. The owner confirmed there is no sandbox. No personal/production test records without specific authorization. See `SETUP-FOR-OWNER.md`.
- **Runtime:** Codex on Windows for this checkout; keep existing Next.js/React/Supabase stack. Use the models/effort caps in `instructions.md` rather than the playbook's generic Claude model table.
- **Read-only models:** Luna or Terra only, including independent code/documentation/security review and complex investigation. Sol is for write work, not read-only reviews or verification.
- **Dependencies:** existing `package.json` is the application baseline. Ask before adding runtime dependencies. Dev test/lint tooling is exempt under WORKFLOW section 7; document additions and pin the lockfile.
- **Writes:** preserve existing user-confirmed transactions, debts, transfers, wallets, history, and chat workflows. AI output is untrusted input, never authorization for financial or memory writes. External AI tools remain read-only. Any change to write policy or database schema requires a reviewed spec/migration and verified ownership checks.
- Commands: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`, `npm start`. GitHub Actions runs the baseline checks. Authenticated and performance checks use the isolated environment in `docs/SANDBOX-BOOTSTRAP.md`.
- Layout: `app/` routes, `components/` UI/providers, `lib/` domain/data/auth, root SQL migration files, `docs/` spec/workflow/design/audit/connection evidence. Keep this map current when boundaries change.

## Design system
- **Read `docs/DESIGN-SYSTEM.md` before any UI work.** Full system with live previews: https://claude.ai/artifact/8sBWHApieVPbvzWN5m5MwX
- Design decisions and their reasons are logged in `docs/DECISIONS.md`. Add a line there the same day a design decision is taken.
- Fonts: Bricolage Grotesque for text, Unbounded for money amounts only (`font-display`). Weight is chosen by role (see the design system). Never add a font `@import`.
- Money headlines use `components/Money.tsx`.
