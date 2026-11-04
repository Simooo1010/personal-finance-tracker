# Setup needed for real-use verification

Updated 2026-11-04. No sandbox exists (owner confirmed). Do not paste secret values into chat.

- [ ] Approve or amend `docs/SPEC.md`. Autonomous mode is selected and starts after that approval; production merge still needs your OK.
- [ ] Choose an isolated non-production database with the verified schema and test-only accounts. An existing project is preferred; creating a paid project/branch requires a separate cost decision. The agent should inspect and prepare a concrete setup before requesting any paid action.
- [ ] Provide two test identities in that sandbox so ownership-denial tests can be verified. Authenticate through the normal user login flow; keep passwords out of repo and chat.
- [ ] Connect a preview deployment to the sandbox through hosting environment settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not point test writes at the personal production project.
- [ ] Configure server-only `SUPABASE_SERVICE_ROLE_KEY` for sandbox OAuth bookkeeping and optionally `GROQ_API_KEY` / `GROQ_MODEL` for AI tests. Keep optional AI disabled until specifically testing it.
- [ ] Make the preview available to the authorized test browser. The current immutable production deployment URL redirects this browser to Vercel login; do not disable protection or create persistent access merely to bypass it.
- [ ] Record the actual phone/browser and desktop/browser for owner acceptance. Scope is both sizes and both themes.

Agent-owned next work: repair/verify reproducible dependency installation after spec approval, add the automated safety net, prepare a schema bootstrap/migration proposal, populate only sandbox disposable fixtures, and provide the exact preview checklist. Do not ask the owner to rediscover connected project IDs already in `docs/CONNECTIONS.md`.
