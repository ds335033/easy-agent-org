# Windows PowerShell, npm, npx, CMD — safe engineering quick reference

Open **Windows PowerShell** in the local clone of `ds335033/easy-agent-org`.

## Inspect installed tools (no configuration changes)
```powershell
node --version
npm --version
git --version
codex --version
codex login status
codex mcp list
codex doctor
```
A reported MCP registration does not guarantee a working OAuth grant or tool call.

## Project tests and local development
```powershell
npm test
npm run check
npm start
```
The project requires Node.js 20 or newer and defaults to localhost:3000. Review the access token and network-binding settings before exposing it.

## npx: run a reviewed vendor CLI
```powershell
npx --yes wrangler@4 whoami
```
This checks Cloudflare CLI authentication; it does not provision resources. Approve any actual OAuth sign-in in the vendor's own trusted browser.

## CMD equivalents
```cmd
node --version
npm --version
codex --version
codex login status
npm test
npm run check
```

## Safety constraints
- Do not copy, echo, commit or screenshot provider tokens.
- Do not blindly execute downloads, unknown package scripts, hidden PowerShell payloads, or unreviewed `npx` packages.
- Use official documented authentication and account-based quota controls.
- Ask for approval before code that charges accounts, modifies DNS, sends external messages or deploys to production.

Cloud environment guide: ../CODEX-CLOUD-SETUP.md
