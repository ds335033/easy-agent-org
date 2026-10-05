# Easy Agent Codex

An original self-hosted coding workspace for Darren Smith and Easy Agent.
Charcoal, orange and white; real task progress, reviewable changes, and an
explicit boundary between local readiness and production deployment.

**Status: tested local developer foundation, not a production multi-tenant service.**
Independent software; not OpenAI Codex Cloud or a copy of its private infrastructure.

## Working journey

Create/open a project → submit an AI task → inspect its diff → run checks in
Docker → preview its HTML → download a source artifact. Publication stays
disabled until the existing Sites workflow is available and authorized.

- Persistent projects, task history, streamed output, cancellation, and checkpoints.
- File browser/editor, Git change previews, check results, HTML preview, exports.
- Ollama native and OpenAI-compatible Chat Completions streaming adapters.
- Per-user ownership checks and bearer tokens kept in browser memory only.
- Disposable, non-root Docker command execution with network off, dropped
  capabilities, read-only base, CPU/memory/PID/time/output limits.
- Agent OS project standards shared by Codex, Claude Code and Cursor.
- Pinned OmniRoute installation (audit-blocked) and separately configured Orca CLI.

## Local setup

Requirements: Node **24–26**, Git, `tar`, Docker with Linux containers, and Ollama.
See [Windows instructions](docs/windows.md) for your Dell and the installer.
The core application has no npm runtime dependencies.

```sh
ollama pull qwen3:1.7b
docker pull node:24-bookworm
```

Start Ollama using its supported installation. For direct local development:

```sh
LOCAL_DEV=true MODEL_PROTOCOL=ollama MODEL_NAME=qwen3:1.7b npm start
```

This explicit development mode is loopback-only. For token-protected operation,
configure a random `ADMIN_TOKEN` of at least 24 characters in managed settings
or an ignored `.env` file. Do not paste tokens into chat or source control.
Use the application's token login, never browser local storage for credentials.

For the installed OmniRoute/Orca stack, use the documented sequence in
[developer configuration](docs/developer-configuration.md). The launcher binds
locally and generates **local** credentials privately; it does not generate
OpenAI, Anthropic, Stripe or other providers' keys.

The default launcher uses Ollama directly. OmniRoute 3.8.51's dependency audit
reported high/critical advisories, so gateway startup is blocked until a verified
patched upgrade passes the audit. Orca's sandbox is also blocked on this cloud
host. Neither is represented as a ready production integration.

## Verification

```sh
npm test
npm run check
npm run build
```

`npm test` runs actual Docker tests when Docker/image are available, and reports
skips otherwise. Model contract tests use fixtures. `scripts/smoke-live.mjs`
separately creates a project and runs real model inference, Docker checks and
preview assertions against an already-started configured application.
`scripts/browser-smoke.mjs` uses an explicitly supplied Playwright installation.
See [validation evidence](docs/validation.md) for this development run.

## Costs and capacity

This application has no subscription/paywall and no founder application fee.
Local inference does not incur a hosted-model API charge, but uses hardware,
storage and electricity. Hosted APIs, Codex, Claude and Cursor retain their own
plans and limits. No unlimited-free, forever-available, or frontier-model-quality
claim is made. The small starter model may make coding mistakes: review diffs
and run checks. Safety limits remain enabled, including daily task and concurrency
limits; see `.env.example` and [operations](docs/operations.md).

## Boundaries before production

Only trusted operators should use this release. Project bind mounts do **not**
have filesystem byte/inode quotas. Container limits cannot prevent host disk
exhaustion. Processing bounds are defense in depth, not a hard storage sandbox.
Docker daemon access is host-privileged; do not expose it or mount it into tasks.
The compose image alone cannot provide the complete execution workflow.

GitHub account integration/PR UI, remote OAuth plugins, Stripe checkout/webhooks,
and existing Sites publication are not connected. The supplied website URL did
not provide editable source. No payment source was imported from unrelated apps,
no live charges were enabled, and the existing audience was not changed.

Read [architecture](docs/architecture.md), [configuration](docs/developer-configuration.md),
[Codex/Cloudflare/Stripe/VS Code setup](docs/codex-cloud-integrations.md), and
[operations/recovery](docs/operations.md) before hosting this service.
