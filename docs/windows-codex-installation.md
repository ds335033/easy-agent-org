# Codex installation and launch notes for Windows

Archived for Darren Smith on 6 October 2026 (Australia/Adelaide).

## Confirmed environment

- Windows 10 Pro x64 on a Dell ultrabook
- Node.js `v24.19.0`
- Easy Agent repository branch `feat/developer-workspace`
- Codex successfully launched from a non-elevated PowerShell terminal

## Start Codex safely

Codex's shared background daemon must run as the normal Windows user. Close any
PowerShell or Windows Terminal window opened with **Run as administrator**. Open
a new terminal normally and confirm that it is not elevated:

```powershell
([Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
```

The expected result is `False`.

Open the Easy Agent checkout and launch Codex:

```powershell
cd "$env:USERPROFILE\Documents\easy-agent-org"
codex
```

If the checkout is stored elsewhere, replace the path with its actual location.
Run `codex --help` if the installed Codex release uses a different entry command.

## Recorded error and resolution

An elevated terminal produced:

```text
Error: start the Windows daemon from a non-elevated terminal; shared clients must not inherit administrator privileges
To work without the background server, rerun the same command with --no-daemon (including resume or fork and its arguments).
```

Resolution: close the administrator terminal and launch `codex` from a normal
PowerShell terminal. This was confirmed working by the operator.

For a one-off session where the daemon is intentionally unavailable, the CLI's
reported fallback is:

```powershell
codex --no-daemon
```

Prefer the normal, non-elevated daemon for routine work. Use administrator access
only for installation operations that explicitly require it. Do not routinely
run Codex, Ollama, Easy Agent, or model-generated project commands as Administrator.

## Related project instructions

- `AGENTS.md` supplies Codex project guidance.
- `CLAUDE.md` supplies Claude Code project guidance.
- `.cursor/rules/easy-agent.mdc` supplies Cursor project guidance.
- `docs/windows.md` covers Easy Agent, Ollama, Docker, Orca and local startup.

These files share project standards; they do not share product authentication,
subscriptions, provider credits, or usage allowances.

## Installed Codex profiles

The Easy Agent Windows installer copies three named profiles into
`$env:USERPROFILE\.codex` while backing up files with the same names:

- `astra-xhigh-fast`: GPT-6-Astra, xhigh reasoning, Fast service tier
- `sol-xhigh-fast`: GPT-6-Sol, xhigh reasoning, Fast service tier
- `luna-fast`: GPT-6-Luna, medium reasoning, Fast service tier

Launch them from a normal PowerShell terminal:

```powershell
codex --profile astra-xhigh-fast
codex --profile sol-xhigh-fast
codex --profile luna-fast
```

These exact models and reasoning levels appeared in the authenticated Codex model
catalog during cloud validation. Availability, rate limits and Fast-tier usage
remain controlled by the signed-in account and can change. Fast can consume usage
more quickly. The profiles retain workspace isolation and on-request approvals.

Codex Cloud commands are included in the installed CLI. They use the signed-in
account and configured cloud environment:

```powershell
codex cloud list
codex cloud --help
```

Treat a successful task list as the readiness check. The cloud validation machine
received a 401 from `codex cloud list` even though general ChatGPT login status was
present, so Codex Cloud was installed but not authenticated there.

To install the official Cloudflare skills and register Cloudflare and Stripe MCP
servers on the Windows PC, run this from a normal terminal and complete the OAuth
screens locally:

```powershell
npx -y skills add cloudflare/skills --skill '*' --yes --global
.\scripts\windows-codex-connectors.ps1
```

Registration alone does not establish account access. Use a Stripe sandbox and
least-privilege OAuth permissions. Do not send API keys through chat or commit them.
