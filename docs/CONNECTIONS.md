# Connection inventory

Verified 2026-11-04. Metadata only; no secret values or financial rows are stored here. These are snapshots, not proof that future sessions are authenticated.

| Service | Identity | Evidence and access | Next check / limit |
| --- | --- | --- | --- |
| GitHub | `Simooo1010/personal-finance-tracker`, HTTPS origin | Connector reads succeeded; permitted Git fetch succeeded. Initial checkout `aaa1f5b`; current remote main `72fe3f6d9a4c1ba2e650469cac63c284f2f090ca`. Audit branch starts from current main. | Verify pushed branch SHA and PR CI at delivery. Sandbox Git metadata writes require elevated tool permission. |
| Playbook source | `Simooo1010/claude-project-playbook` | All six source documents read at `acd42cb48cb1de7f2669de3c7c5845bcb6c53c27`. WORKFLOW adopted locally. | Owner requests finance-app changes only; no upstream PR. |
| Vercel | `personal-finance-tracker`, project `prj_PXOAkTwzqrdO7UG6z2mrqHWg5dtn`, team `team_7cA5Y1PcLGxH0Rcb6HXHzwHx` | Read-only deployment listing succeeded. Production deployment `dpl_EKp4n7QcDaUSmedNeowbuPL8nzAQ` READY at commit `72fe3f6`. | READY is hosting status, not app QA. Available browser was redirected to Vercel login. No login or protection changes performed. |
| Supabase | `Personal finance tracker`, project `aedoncqvypsrksnqiwgh`, region `eu-west-2` | Project list, public schema, RLS policies and public function definitions read successfully. All listed public tables have RLS enabled. | Owner confirmed no sandbox. RLS enabled alone does not prove authorization correctness. Do not call write RPCs for diagnostics. |
| Groq | Configured through server env, not a separate verified connector | Source documents `GROQ_API_KEY` and optional `GROQ_MODEL`; no matching local environment variable names found. | No generation/cost/persistence test performed. Never retrieve or print key values just to check status. |
| Local runtime | Node `v24.13.0`, npm `11.6.2` | `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000 --cache .npm-cache` failed EUSAGE: `Missing: @emnapi/runtime@ from lock file`. | Dependencies/installed Next docs unavailable; lint/type/build and local browser tests blocked. First install attempt stalled and was cancelled. |
| Browser | Codex in-app browser available | Opened deployed `/login`; observed Vercel login barrier. No authenticated finance session was accessed. | Authorized preview and sandbox login needed for user workflow tests. |

## Live schema drift

Source rollback #17 removed application AI writing code. Live public metadata still contains `ai_write_requests`, `create_ai_transaction_once(uuid,text,numeric,text,timestamptz)`, and `execute_ai_write_once(uuid,jsonb)`. Both functions are SECURITY DEFINER, executable by `authenticated`, not by `anon`; their definitions check `auth.uid()` and scope records to that user. This is residual capability/schema drift, not evidence of anonymous or cross-user access. Neither was invoked. They are absent from current repository SQL migrations and need an explicit retained/revoked capability decision in SPEC step 2.

Live `transactions.user_id` is nullable; the repository lacks the base CREATE TABLE. `chat_messages.session_id` references a session ID without a composite owner relationship. Schema and policy reads do not establish that a clean sandbox can be reproduced or that every ownership case passes.

Step 2 recommendation: confirm whether any authorized consumer still uses the two residual write RPCs. If there is no consumer, keep the table and function definitions for reversible rollout and revoke execution from the API roles in a reviewed migration. Check effective grants inherited through `PUBLIC` as well as explicit grants. Capture the prior ACL for rollback, rehearse with two disposable users, and verify that ledger and read-only AI workflows still work. The owner must authorize the production change separately.

Supabase security advisor was also read: it reports the two authenticated SECURITY DEFINER RPCs ([guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)), three informational no-policy OAuth tables (intentional server-only bookkeeping; [guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), and disabled leaked-password protection ([guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Advisor warnings need context; no permission or Auth setting was changed.

## Fast refresh procedure

1. Read this inventory and repository instructions. Check local status and Git remote; preserve unrelated work.
2. In parallel, fetch the relevant remote branch/deployment metadata and the named Supabase schema if relevant. Record exact refs and which checks succeeded, failed or were not attempted.
3. Inspect only missing schema/policy/function metadata needed for the task. Use the known project; do not scan unrelated projects or read user records.
4. Reconcile deployment/source/database drift before any write. Use the approved sandbox for data changes. Access errors need reconnection, not silent fallback to production.
5. Update this inventory only when verified metadata or blockers change. Keep PR/commit evidence in project memory.
