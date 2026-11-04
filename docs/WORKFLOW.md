# Project workflow

Adapted from https://github.com/Simooo1010/claude-project-playbook at commit `acd42cb48cb1de7f2669de3c7c5845bcb6c53c27`, reviewed 2026-11-04. Finance-app settings in `CLAUDE.md`, product safety rules in `AGENTS.md`, and `instructions.md` take precedence over generic template defaults. This checkout runs in Codex on Windows; use the available tools and models specified in `instructions.md`, not unavailable Claude model names. Owner selected Autonomous mode after spec approval; production merge still requires owner OK. The spec below is a proposal until explicitly approved.

# WORKFLOW — how Claude works in this repo

Method for building web/mobile apps with Claude Code. Stack-neutral; §10 gives the default stack.
`CLAUDE.md` holds the project's settings (approval mode, owner, device, rules). This file holds the method.

---

## 1. Principles

1. **Written source of truth.** Spec, rules and decisions live in repo files. A decision taken in chat is written into `docs/SPEC.md` (decision log) the same day.
2. **Small verified steps.** Each step is buildable, testable and reviewable on its own branch.
3. **The owner checks behaviour, not code.** Every step ends with a preview and a check list on the real device.
4. **Honest reporting.** Failing checks are shown. Skipped work is named. "Done" means shown working.
5. **Sessions start cold.** Re-read `CLAUDE.md`, this file and `docs/SPEC.md` at the start of every session and every step.

---

## 2. Phase 1 — Spec (no code yet)

1. **Interview.** Ask the owner in rounds of multiple-choice questions (AskUserQuestion, up to 4 per round, recommended option first, "(Recommended)" in its label). Continue until nothing material is ambiguous. Ask everything up front, not drip-fed during building.
2. **Check reality.** If an external system exists (database, API), read its real schema and copy names and option labels **exactly**.
3. **Write/update `docs/SPEC.md`.** Required sections: Goal, Data (exact names), Build order, Decision log. The existing finance-app spec supplies this structure; no separate template file is required. Everything else free-form.
4. **Write `SETUP-FOR-OWNER.md`**: every step only the owner can do (accounts, env vars, connectors, app installs), in plain words.
5. **Fill `CLAUDE.md`** settings with the owner's answers.
6. **Owner approves the spec.** Record it in the decision log. Only then Step 1.

Spec changes later: separate commit with prefix `SPEC:`, plus a decision-log line.

---

## 3. Approval modes

Set in `CLAUDE.md`. In every mode, a production merge needs the owner's OK unless it is delegated in writing in `CLAUDE.md` (who, when, conditions).

| Mode | Claude may start the next step when… | Owner reviews |
|---|---|---|
| **Strict** | the owner said OK to the current step | every step, on the preview |
| **Milestone** | the current step passes all automated checks and is inside the current milestone | at the end of each milestone |
| **Autonomous** | the current step passes all automated checks | at the end of the build order (or when Claude is blocked) |

In any mode, Claude stops and asks when: reality contradicts the spec, a new dependency is needed, a decision isn't covered by the spec, or a check fails and the fix would change scope.

---

## 4. Phase 2 — The step loop

For each step of the build order:

1. **Re-read** `CLAUDE.md`, this file, the spec section for the step, and the design-system README if UI is touched.
2. **Clarify** anything open, in one round of questions, before writing code.
3. **Branch.** One branch per step. Large steps split into parts (`6a part 1`, `6a part 2`, `6b`), each its own commit.
4. **Build in this order:** data layer → pure logic (no I/O, unit-tested) → UI that only renders view models. Every number or rule on screen has a test behind it.
5. **Verify** (§6, gate 1). Fix until clean.
6. **Push, open a draft PR**, subscribe to its activity (§8).
7. **Hand-off message** (§5).
8. **Wait** as the approval mode requires. Owner feedback → fixes on the same branch → new hand-off.
9. **Merge** when the mode allows. Then the next step.

---

## 5. Hand-off message (end of every step)

Always these five parts, in this order:

```
**Step N — <name>** · Preview: <URL>

**What to check** (on <device>)
1. <action> → <what you should see>
2. …

**Not in this step**
- <thing the owner might expect but that comes later — Step M>

**Checks**
- lint ✅ · build ✅ · tests ✅ 142 passed  (or ❌ with the failing output)

**Open questions / next**
- <decision needed, with recommended option>
- Next: Step N+1 — <name>
```

Rules: check list in plain words, one action per line, written for a phone. Never hide a failure.

---

## 6. Quality gates

| # | Gate | When | Required |
|---|---|---|---|
| 1 | Lint + build + unit tests pass for executable changes; docs-only changes require content/link/full-diff review under AGENTS.md | before every push | always; record actual failures/blockers, never claim skipped checks passed |
| 2 | Real-data run in the authorized sandbox; synthetic or anonymized representative fixtures stay inside tests, never copy personal records or credentials | before the step that handles external data is approved | always for external-data behavior; docs-only changes do not require app writes |
| 3 | Independent code review (`/code-review` or a separate review subagent); fixes in their own commit `Fixes from the code review` | before production | always |
| 4 | Final QA: full walkthrough of every screen on the test device; fixes in `Fixes from the final QA` | before production | always |
| 5 | Visual check: screenshots of each screen in every supported theme and size (from `CLAUDE.md` settings) | before production; also for UI-heavy steps | always |

Every bug fixed gets a test, so later sessions cannot regress it.

---

## 7. Safety rules

- Secrets only in environment variables. Never in repo files, logs, chat output or client code.
- `.env.example` lists variable names with no values.
- External credentials used server side only.
- The app writes only the fields/resources listed in `CLAUDE.md`.
- Paginate every external query.
- No fake data outside test fixtures.
- Reality ≠ spec → stop and report. Don't guess, don't rename.
- New dependency → ask first; on approval add it to `CLAUDE.md` with approver and date. Dev tooling (lint, test runner) excepted.

---

## 8. Git and PR conventions

- Branch per step: `codex/step-<n>-<short-name>`; docs: `codex/docs-<name>`; spec: commits prefixed `SPEC:`.
- Commit messages name the step and the user-visible change: `Step 4: Progress screen (hours, weekly chart, streak)`.
- PR titles describe what the user sees, not the code.
- Every pushed branch gets a **draft PR**.
- **PR watching is on by default:** Claude subscribes to every PR it opens and drives it to green — fixes CI failures, answers review comments, re-runs nothing blindly, never skips or disables tests.
- Never rewrite history on a branch someone else works on.

---

## 9. Subagents and models

Use subagents only when they pay off (parallel independent work, large sweeps, independent review).

| Work | Model |
|---|---|
| Research, read-only sweeps, light low-risk tasks | Luna or Terra as specified in instructions.md |
| Building, implementation, verification, fixing errors | Sol as specified in instructions.md |

- Effort at most **High**. Never max.
- Independent subagents run in parallel in the same turn.
- The code review (gate 3) is done by an agent that did not write the code.

---

## 10. Default stack

Use unless the spec says otherwise.

- **Framework:** Next.js (App Router) + TypeScript strict.
- **Hosting:** Vercel — preview deployment per branch, production = `main`.
- **Repo:** GitHub, accessed by Claude through the GitHub tools.
- **Dev environment:** this checkout uses Codex on Windows; owner tests previews on the device. Follow the actual sandbox/network permission boundaries.
- **Tests:** Vitest for all pure logic.
- **Commands:** `npm run lint`, `npm run build`, `npm test`, `npm run dev` (sandbox only).
- **Secrets:** cloud environment variables (sandbox) + Vercel env vars (Preview + Production). Never `NEXT_PUBLIC_` on a secret.

---

## 11. Communication

- Docs and code in English. Replies in the language the owner writes in.
- Owner-facing text (check lists, setup docs, UI copy) in simple language.
- Ask clarifying questions up front with a recommended option.
- Short status lines while working; the record lives in commits, PRs and docs.
- Say what was not done and why.
