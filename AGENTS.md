## Required project context

Before any task, read [instructions.md](instructions.md) and [MEMORY.md](MEMORY.md), as well as this file. Follow the delegation, GitHub sync, and verification rules there. Update project memory with verified changes and outstanding blockers before delivery.

Read [docs/WORKFLOW.md](docs/WORKFLOW.md) and [docs/SPEC.md](docs/SPEC.md) before implementation. Use [docs/CONNECTIONS.md](docs/CONNECTIONS.md) for fast read-only discovery; verify current access rather than assuming a stored connection works. Autonomous mode starts only after the owner approves the spec.

**Model routing:** all read-only assignments, including independent code, documentation and security reviews, use Luna or Terra only. Sol/Astra are not substitutes for read-only work. See `instructions.md` for write-task routing and effort caps.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Required review, testing, and real-usage loop

For every change in this repository, treat implementation as unfinished until this loop has been completed or an external blocker is clearly recorded:

For documentation-only changes, review content, links, and the full diff; app automated checks and browser flows may be marked not applicable when no executable code or app behavior changed. Still complete the GitHub delivery steps or record their blockers.

1. **Define acceptance from use.** Before changing code, write down the expected user-visible behavior, the main successful path, and likely mistakes, retries, cancellation, and recovery cases. Keep actions that modify data behind the confirmation and authorization rules in the product.
2. **Review the implementation.** Inspect the relevant code and the full diff for correctness, security, ownership, input validation, accessible controls, failure handling, and consistency with existing product behavior. Do not rely on the model's response as authority for a write.
3. **Run automated checks.** Run focused tests for the changed behavior, the relevant existing test suite, lint/type checks, and a production build when available. Add or update tests when the change needs them. Fix failures introduced by the change and rerun the affected checks after every correction. Record pre-existing failures separately.
4. **Exercise the actual app as a user.** Start or use the deployed app in an authorized browser and walk through the principal workflow with ordinary human actions: type, click, cancel, retry, navigate away and back, reload, and check the resulting UI and data. Cover the success path and the important error and duplicate-action paths. Check a narrow/mobile layout when the change affects the UI. Use a dedicated sandbox/test account and disposable data for live writes; do not create test records in a real personal or production account unless the user explicitly authorizes that specific test.
5. **Repeat until it works.** When any review, test, or real-usage step finds a defect, fix it and repeat the relevant automated and real-usage steps, including regression checks, until all acceptance criteria pass. Do not declare success based only on static checks or a successful build.
6. **Close the delivery loop.** Confirm the final diff is clean, open or update the PR, wait for required CI, address failures and review feedback in the same loop, and merge only when checks pass and repository protections allow it. Report completed checks, real-usage coverage, merge/deployment state, and any blocker that prevented an end-to-end test.

If credentials, an authorized browser, a sandbox account, an applied database migration, or another external dependency is missing, continue all independent review and automated checks. State precisely which real-usage cases remain untested and what access or setup is required; never imply that the feature works in real use when it has not been exercised.
