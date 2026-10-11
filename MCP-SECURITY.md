# MCP and privacy controls — Easy Agent

## Principles
Legitimate privacy means data minimization, confidentiality, least privilege, encryption, and accountable access. It does **not** mean concealing fraud, avoiding financial reporting, or using deceptive accounts.

## MCP inventory and access
- Maintain an explicit inventory: server name, owner, transport, scopes, authentication method, allowed actions and last successful health check.
- Treat `enabled` or `registered` as configuration status only; run a read-only smoke test before claiming a service is connected.
- Pin reviewed package versions and avoid automatic execution of untrusted remote installers.
- Separate staging and production; prevent code agents from making unreviewed financial or deployment changes.
- Revoke unused OAuth grants and tokens; apply MFA and access reviews.

## GitHub and Codex
- `ds335033/easy-agent-org` was public when checked on 2026-10-11. Never commit keys, customer information, production URLs with tokens, or private identity documents.
- Keep proprietary business data in separately authorized private storage or a private repository with reviewed sharing settings.
- Use `AGENTS.md` and branch PRs to enforce tests, diffs, and code review.

## Payments and customer data
- Use verified business registration and compliant identity verification with providers.
- Process legitimate customer payments via provider-hosted checkout where possible; verify server-side webhook signatures.
- Do not store card numbers in this codebase. Apply least-privilege service credentials and restrict database access with row-level security where applicable.
- Log operational events without leaking secrets or unnecessary personal data; establish a clear retention policy.

## Operational checklist
1. Audit public repository contents for exposed secrets and rotate any compromised key.
2. Enable MFA on GitHub, ChatGPT and payment accounts.
3. Validate `npm test` and `npm run check` on every change.
4. Add production health checks, rollback procedures and budget alerts.
5. Confirm every customer communication and payment is authorized.

**No account, payment, credit or environment has been activated merely by creating this document.**
