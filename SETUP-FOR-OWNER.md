# Setup needed for real-use verification

Updated 2026-11-05. No sandbox exists (owner confirmed). Do not paste secret values into chat.

- [x] Approve `docs/SPEC.md`. Autonomous delivery started on 2026-11-05. Production merge requires separate approval.
- [ ] Choose an isolated non-production database with the verified schema and test-only accounts. An existing project is preferred; creating a paid project/branch requires a separate cost decision. The agent should inspect and prepare a concrete setup before requesting any paid action.
- [ ] Provide two test identities in that sandbox so ownership-denial tests can be verified. Authenticate through the normal user login flow; keep passwords out of repo and chat.
- [ ] Connect a preview deployment to the sandbox through hosting environment settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not point test writes at the personal production project.
- [ ] Configure server-only `SUPABASE_SERVICE_ROLE_KEY` for sandbox OAuth bookkeeping and optionally `GROQ_API_KEY` / `GROQ_MODEL` for AI tests. Keep optional AI disabled until specifically testing it.
- [ ] Make the preview available to the authorized test browser. The current immutable production deployment URL redirects this browser to Vercel login; do not disable protection or create persistent access merely to bypass it.
- [ ] Record the actual phone/browser and desktop/browser for owner acceptance. Scope is both sizes and both themes.

The [sandbox bootstrap proposal](docs/SANDBOX-BOOTSTRAP.md) lists the schema and local tools still needed. Once the environment is ready, the agent can populate disposable fixtures, test two-user isolation and persistence, and measure performance. The existing project identifiers are recorded in [Connection inventory](docs/CONNECTIONS.md).
