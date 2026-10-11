# Codex full-stack setup for Easy Agent

This repository is designed for Codex CLI / the Codex editor extension. The root AGENTS.md supplies project instructions automatically when Codex opens this repository.

## 1. Open the correct repository
```powershell
git clone https://github.com/ds335033/easy-agent-org.git
Set-Location .\easy-agent-org
git status --short --branch
```
If it is already cloned, open that existing folder instead of creating a second copy.

## 2. Verify Codex and project prerequisites
```powershell
codex --version
codex mcp list
node --version
npm --version
```
Use Node.js 20 or newer. Sign into Codex through the official login flow if requested. A ChatGPT/Codex subscription does not automatically include API credits or cloud spend.

## 3. Run the full-stack checks
```powershell
npm install
npm test
npm run check
```
The project currently uses Node.js ES modules and its root app is intentionally dependency-light. Review package scripts and lockfiles before adding dependencies.

## 4. Enable useful documentation context
The official OpenAI developer-docs MCP is read-only and helps Codex consult current OpenAI documentation. Add it only if it is not already registered:
```powershell
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
codex mcp list
```
Official reference: https://developers.openai.com/learn/docs-mcp

Do not add duplicate MCP names. For existing GitHub, Cloudflare, Supabase, Playwright, Sentry, Stripe or AWS servers, verify each server's status with codex mcp list and complete its official authentication flow where required. Never paste secrets into chat or commit them to this repository. Registered does not mean authenticated or enabled.

## 5. Work safely
- Keep the public static marketing site in website/.
- Do not expose the root coding-agent application, terminal, filesystem or workspace APIs to the public internet.
- Use preview/test environments first; verify the account, project, region, cost and permissions before cloud mutations.
- Use Stripe test mode until the price, currency, terms, fulfilment and webhook behavior are verified.
- Before release, run tests, review the diff, smoke-test the deployment, and report limitations.

## What this document does not do
This guide documents a reproducible setup; committing it does not remotely alter your Windows Codex installation or grant account access. Local MCP connections still require the user-controlled Codex CLI/editor and any necessary OAuth approvals.
