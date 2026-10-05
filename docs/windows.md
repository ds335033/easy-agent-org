# Windows 10 Pro x64 setup

This cloud session cannot install software onto your Dell PC. The repository
includes a PowerShell installer to run locally. It installs pinned OmniRoute
3.8.51 and Orca 0.5.6 without editing your global Codex/Claude/Cursor configuration.

From a checkout of the feature branch, open PowerShell in the repository:

```powershell
.\scripts\windows-setup.ps1 -InstallPrerequisites
```

If Windows script policy blocks execution, use your organization's approved
PowerShell procedure. The installer does not disable script policy or security
features. You may need to reopen PowerShell after prerequisite installation.

Docker project execution needs a currently supported Docker Desktop/WSL 2
configuration and hardware virtualization. Verify the current [Windows
requirements](https://docs.docker.com/desktop/setup/install/windows-install/)
against your Windows build. Windows 10 Pro alone does not establish support.
The setup does not silently enable Windows features, reboot, or switch hosting.

1. Start Ollama, then run `ollama pull qwen3:1.7b`. This is a small CPU-capable
   starter model with tool support. Larger models require more RAM/compute.
2. Start Docker Desktop's supported Linux backend and run
   `docker pull node:24-bookworm`.
3. Run `node scripts/developer-tools.mjs probe` to check Ollama.
4. Run `node scripts/developer-tools.mjs app`. It uses Ollama directly by default.
   Read the `adminToken` from
   `.runtime/local-credentials.json` privately on your PC and enter it into the
   application login. Never paste it into chat or commit that file.
5. Run `node scripts/developer-tools.mjs doctor` to verify Orca configuration.
   Use Orca only when its sandbox diagnostic passes. On a supported host,
   `node scripts/developer-tools.mjs orca exec --mode plan --max-turns 3
   --max-tool-calls 5 --max-wall-time-secs 120 "Inspect this project"`
starts a bounded planning run.

**OmniRoute is installed but blocked:** its pinned dependency audit reported
high/critical advisories. The launcher refuses to start it or select it as the
backend until the audit passes after a supported patched upgrade. Do not disable
the audit gate. Direct Ollama remains the local default and needs no paid API key.

Codex, Claude Code and Cursor themselves are not installed by this script. Use
their official installers/accounts separately. The shared project instructions
below are installed; they do not replace those applications' setup.

The confirmed Windows Codex launch procedure and administrator-terminal error
recovery are archived in [`windows-codex-installation.md`](windows-codex-installation.md).

## VS Code workspace

The Windows installer requests the official VS Code package and recommends the
OpenAI Codex and Microsoft PowerShell extensions. After reopening a normal,
non-administrator PowerShell terminal, open the complete project:

```powershell
cd "$env:USERPROFILE\Documents\easy-agent-org"
code .
```

VS Code automatically reads `.vscode/settings.json`, `.vscode/tasks.json`,
`.vscode/extensions.json`, and `.vscode/mcp.json`. Open the integrated terminal
with **Terminal → New Terminal**. It starts PowerShell in the repository root.
Use **Terminal → Run Task** for probes, tests, builds and local application startup.

The MCP file registers official Cloudflare and Stripe endpoints. Registration is
not account access: authenticate interactively in VS Code and grant only the
required sandbox/test permissions. Do not authorize live Stripe mutations while
validating the development environment.

Codex reads `AGENTS.md`; Claude Code reads `CLAUDE.md` and its five Agent OS
commands; Cursor reads `.cursor/rules/easy-agent.mdc`. These share project rules
and source files. They do not share authentication, bypass usage limits, or
coordinate simultaneous edits automatically. Give each concurrent task its own
branch/checkout and review changes before combining them.

The local configuration does not contain paid provider keys. Add any future
provider key using that provider's official account/dashboard and OmniRoute's
provider settings. Provider billing and model availability must be verified
separately. Preserve the existing Sites deployment audience and payment flow.
