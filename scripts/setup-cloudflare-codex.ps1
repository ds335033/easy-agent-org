# Windows PowerShell helper, run manually in a trusted local session
$ErrorActionPreference = 'Stop'
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm/npx is required.' }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Codex CLI is required.' }
Write-Host 'Installing official Cloudflare skills...'
npx -y skills add cloudflare/skills --skill '*' --yes --global
if ($LASTEXITCODE -ne 0) { throw 'Skill install failed.' }
Write-Host 'Registering Cloudflare MCP...'
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
if ($LASTEXITCODE -ne 0) { Write-Warning 'Registration may already exist. Check codex mcp list.' }
Write-Host 'Authenticating: complete the browser OAuth prompt.'
codex mcp login cloudflare
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare OAuth login not confirmed.' }
codex mcp list
Write-Host 'Restart Codex/VS Code to load Cloudflare skills.'
