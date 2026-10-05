param([switch]$InstallPrerequisites, [string]$ToolsDirectory = "$env:LOCALAPPDATA\EasyAgent\tools")
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not [Environment]::Is64BitOperatingSystem) { throw 'An x64 Windows installation is required.' }
if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'x86')) { throw 'This setup targets an x64 Dell/Windows PC.' }
if ($InstallPrerequisites) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Install Microsoft App Installer (winget) first.' }
  foreach ($PackageId in @('Git.Git', 'OpenJS.NodeJS.LTS', 'Ollama.Ollama')) {
    winget install --id $PackageId --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget failed for $PackageId ($LASTEXITCODE)" }
  }
  Write-Host 'Prerequisites requested. Reopen PowerShell if PATH changes are not visible.'
}
foreach ($Tool in @('node', 'npm.cmd', 'git')) {
  if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { throw "Missing $Tool. Run with -InstallPrerequisites, then reopen PowerShell." }
}
$NodeVersion = (& node -p 'process.versions.node').Trim()
$Major = [int]$NodeVersion.Split('.')[0]
if ($Major -lt 24 -or $Major -ge 27) { throw "Use Node 24, 25, or 26 for the pinned OmniRoute package; found $NodeVersion." }

$ProjectDirectory = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $ToolsDirectory | Out-Null
Push-Location $ProjectDirectory
try {
  npm.cmd install --prefix (Join-Path $ToolsDirectory 'omniroute') --save-exact --omit=dev omniroute@3.8.51
  if ($LASTEXITCODE -ne 0) { throw 'OmniRoute installation failed.' }
  npm.cmd install --prefix (Join-Path $ToolsDirectory 'orca') --save-exact --omit=dev '@blade-ai/orca@0.5.6'
  if ($LASTEXITCODE -ne 0) { throw 'Orca installation failed.' }
  $env:EASY_AGENT_TOOLS_DIR = $ToolsDirectory
  [Environment]::SetEnvironmentVariable('EASY_AGENT_TOOLS_DIR', $ToolsDirectory, 'User')
  New-Item -ItemType Directory -Force -Path '.runtime' | Out-Null
  $OperatorIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  icacls '.runtime' /inheritance:r /grant:r "${OperatorIdentity}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the private runtime directory.' }
  node scripts/developer-tools.mjs doctor
  $DoctorResult = $LASTEXITCODE
  if ($DoctorResult -ne 0) { Write-Warning 'Orca reported a missing prerequisite. Keep its sandbox enabled and follow the diagnostic output.' }
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Start Docker Desktop with a supported WSL 2/Linux backend before running project checks.' }
  } else {
    Write-Warning 'Project execution needs Docker. Install Docker Desktop using its official Windows instructions if this Windows build is supported, or use a supported remote execution host.'
  }
  Write-Host 'Installed pinned developer tools. Agent OS instructions are already included in this repository.'
  Write-Warning 'The pinned OmniRoute dependency audit has high/critical advisories. Its launcher is blocked pending a patched upgrade. Use direct local Ollama.'
  Write-Host 'Next: ollama pull qwen3:1.7b; start supported Docker Linux containers; docker pull node:24-bookworm; start the app. See docs/windows.md.'
} finally { Pop-Location }
