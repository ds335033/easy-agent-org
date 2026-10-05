# Codex, Cloudflare, Stripe and VS Code developer setup

Validated on 6 October 2026 (Australia/Adelaide). Account access can change.

## Codex CLI and models

The cloud environment has Codex CLI `0.159.0-alpha.3`; `codex login status`
reported ChatGPT authentication. `codex cloud` commands and stable Fast Mode are
included. A live `codex cloud list` request returned `401 Unauthorized`, so Codex
Cloud task access is **not verified** and this session needs re-authentication.
The live model
catalog exposed these relevant choices:

| Profile | Model | Reasoning | Service tier | Purpose |
| --- | --- | --- | --- | --- |
| `astra-xhigh-fast` | `gpt-6-astra` | `xhigh` | `fast` | Demanding architecture and debugging |
| `sol-xhigh-fast` | `gpt-6-sol` | `xhigh` | `fast` | Main coding workhorse |
| `luna-fast` | `gpt-6-luna` | `medium` | `fast` | Faster, easier tasks |

The Fast service tier can consume account usage more quickly. Model availability,
billing and quotas belong to the signed-in account. These profiles do not add
credits or bypass limits. The Windows installer copies them to the standard
Codex profile directory and backs up conflicting named files.

The profiles use `workspace-write` and `on-request` approvals. “Developer mode”
in this project means these reviewed development permissions, task tooling and
MCP registrations. It does not enable `danger-full-access` or bypass the sandbox.

## Cloudflare

Cloudflare's official skills were installed in the active cloud environment from
`cloudflare/skills`. The official remote MCP endpoints registered with Codex are:

- `cloudflare` — account API
- `cloudflare-docs` — public documentation
- `cloudflare-bindings` — Workers bindings
- `cloudflare-builds` — build management
- `cloudflare-observability` — logs and observability

Wrangler `4.147.0` was invoked successfully. `wrangler whoami` reported **not
authenticated**. The remote account MCPs also report **not logged in**. OAuth
must be completed locally before account reads or deployment claims. Registration
does not authorize DNS, domains, deployments, logs, or other account resources.

The existing Sites hosting workflow and audience remain unchanged. Cloudflare
development support does not turn this Node/Docker controller into a Worker.

## Stripe

The official remote endpoint `https://mcp.stripe.com` is registered in Codex and
VS Code configuration. It reports **not logged in**. Stripe documents this MCP
integration as a public preview and recommends OAuth for interactive clients.

During development, authorize a Stripe sandbox with the smallest useful scopes.
Do not enable live charges, create live products, issue refunds, or modify the
production account as a connectivity test. MCP authorization does not implement
the application's missing checkout, entitlement, order store, webhook signature,
idempotency, delayed-payment or refund flows.

## VS Code

Open the repository with `code .` from a normal Windows terminal. Project files
provide PowerShell terminal defaults, Easy Agent build/test/start tasks, Codex
profile tasks, extension recommendations, and Cloudflare/Stripe MCP endpoints.

The OpenAI Codex extension and CLI share the user's Codex configuration. VS Code
must still complete extension sign-in and each required OAuth flow on the user's
PC. Chat, terminal and MCP registration do not share provider secrets with the
browser application.

## Verification commands

```powershell
codex login status
codex doctor --summary
codex mcp list
codex cloud list
npx -y wrangler@4 whoami
npm test
npm run check
npm run build
```

Restart Codex and VS Code after installing skills or changing MCP configuration.
If `codex login status` looks valid but `codex cloud list` returns 401, use the
official Codex login flow again from the normal Windows user account and retry.
