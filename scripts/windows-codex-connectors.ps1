$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this connector setup from a normal, non-administrator PowerShell terminal.'
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Install and sign in to the official Codex CLI first.' }

$Servers = [ordered]@{
  'cloudflare' = 'https://mcp.cloudflare.com/mcp'
  'cloudflare-docs' = 'https://docs.mcp.cloudflare.com/mcp'
  'cloudflare-bindings' = 'https://bindings.mcp.cloudflare.com/mcp'
  'cloudflare-builds' = 'https://builds.mcp.cloudflare.com/mcp'
  'cloudflare-observability' = 'https://observability.mcp.cloudflare.com/mcp'
  'stripe' = 'https://mcp.stripe.com'
}

foreach ($Entry in $Servers.GetEnumerator()) {
  codex mcp get $Entry.Key *> $null
  if ($LASTEXITCODE -ne 0) {
    codex mcp add $Entry.Key --url $Entry.Value
    if ($LASTEXITCODE -ne 0) { throw "Could not register MCP server $($Entry.Key)." }
  } else {
    Write-Host "MCP server $($Entry.Key) is already registered."
  }
}

Write-Host 'Cloudflare and Stripe MCP endpoints are registered.'
Write-Host 'Complete OAuth from this PC with: codex mcp login cloudflare'
Write-Host 'Then authenticate the other account servers when Codex prompts on first use.'
Write-Host 'Use a Stripe sandbox and least-privilege permissions during development.'
codex mcp list
