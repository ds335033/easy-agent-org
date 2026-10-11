# Easy Agent full-stack Codex setup

This is the setup path for the existing Easy Agent coding workspace. Root `AGENTS.md` is loaded as project guidance by Codex; keep this guide aligned with the actual repository and its Agent OS standards.

## Verify the local environment
Run from the repository root in PowerShell:
```powershell
codex --version
codex mcp list
node --version
npm --version
git status --short --branch
```

This project currently requires Node.js 24–26 (see `package.json`). Use the project's documented version rather than assuming Node 20 is sufficient.

## Full-stack validation
```powershell
npm install
npm test
npm run check
npm run build
```
Record exact results. If a command fails, inspect the failure and do not describe the workspace as production-ready until the blocker is resolved.

## MCP connections
Use `codex mcp list` to inspect configured servers. The local Codex configuration may already contain OpenAI developer docs, GitHub, Cloudflare, Stripe, Sentry, Railway, and other MCP entries; avoid adding duplicates.

An MCP entry is not proof that the server is enabled, online, authenticated, or authorized for a specific action. Complete OAuth through the provider's official flow and confirm the requested account, organization, project and permissions before making changes. Never put tokens in this repository, command arguments, screenshots, or chat.

If the official OpenAI developer-docs MCP is missing, add it once:
```powershell
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
codex mcp list
```
Official reference: https://developers.openai.com/learn/docs-mcp

## Safe operating rules
- Read `agent-os/standards/index.yml` and the relevant standard before coding.
- Keep credentials in managed settings or ignored `.runtime/` files; never print or commit secrets.
- Run project tools in the Docker executor; do not mount controller secrets or the Docker socket into project workloads.
- Keep the public marketing site separate from the privileged coding workspace and its shell/filesystem APIs.
- Use test mode for payment changes; verify price, currency, fulfilment, webhook signatures and terms before live checkout.
- Verify cloud account, region, permissions and potential charges before deployment. Account IDs are identifiers, not credentials.
- Use a feature branch, review the diff, run checks and smoke tests, then request approval before production publication.

## Limits
These instructions configure project behavior when Codex opens this checkout. They do not grant API credits, cloud permissions, OAuth approval, or unlimited provider usage. Authentication and billing remain controlled by each provider.
