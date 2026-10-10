# Cloudflare setup for Easy Agent Codex (Windows)

Official source: https://developers.cloudflare.com/agent-setup/prompt.md

## Run on your Windows PowerShell terminal, with Codex installed

```powershell
npx -y skills add cloudflare/skills --skill '*' --yes --global
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare
codex mcp list
```

Complete the browser-based Cloudflare OAuth sign-in when prompted. Restart Codex / VS Code to load newly installed skills and MCP servers.

## Deployment

Sales preview source: `sales-campaign/index.html`
GitHub workflow: `.github/workflows/deploy-sales-cloudflare.yml`

Required GitHub Actions secrets (enter in GitHub UI, not in repository code):
- `CLOUDFLARE_API_TOKEN`: least-privilege Cloudflare Pages edit token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account identifier

The workflow uses Wrangler to deploy `sales-campaign/dist` to an isolated Cloudflare Pages preview. It is manually triggered and must be available on the default branch before GitHub's normal workflow_dispatch UI can run it.

Do not deploy the demo form as a working CRM: the backend route `/api/leads` has not been implemented, and Stripe test checkout is only sample code. No live charges are enabled.

## Optional Cloudflare CLI (beta)
Only install if explicitly desired:
```powershell
npm install -g cf
cf auth login
```
Cloudflare advises using the `cf` CLI unless the project already has Wrangler configuration.

## Troubleshooting
- `codex mcp list` checks registration only; it does not prove OAuth is complete.
- OAuth sign-in requires your Cloudflare account approval in the browser.
- Run `wrangler whoami` to verify your local Cloudflare authentication separately.
- Do not put secrets in .env files committed to GitHub.
