# Developer configuration

## Verified upstreams

| Component | Pinned version/source | Role |
| --- | --- | --- |
| OmniRoute | `omniroute@3.8.51`, [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | Local OpenAI-compatible gateway |
| Orca | `@blade-ai/orca@0.5.6`, [echoVic/orca-agent](https://github.com/echoVic/orca-agent) | Separate coding CLI |
| Agent OS | [buildermethods/agent-os](https://github.com/buildermethods/agent-os), commit `475b0cac4c7c5cf2336ad5a663b691a6d3415e05` | Standards/specification workflow |
| Ollama | 0.35.1 in the cloud validation environment | Local model runtime |
| Starter model | `qwen3:1.7b` | Small CPU-capable tool-calling model |

The Julian Goldie YouTube reference could not be retrieved here. Agent OS was
selected from its official upstream, not from a claimed video transcript.

## Local gateway setup

**Security hold, 2026-10-05:** the pinned OmniRoute install reported 3 moderate,
3 high and 5 critical dependency findings (including inherited findings), with
no automated fix reported for its Next.js dependency. See
[GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
These audit findings are not proof of exploitability in this deployment, but
they block a hardened-readiness claim. The running gateway was stopped.
`router`, `configure-router`, and `USE_OMNIROUTE=true` require an audit without
high/critical findings before continuing. Do not bypass that gate.

Use `node scripts/developer-tools.mjs app` for direct Ollama now. The gateway
sequence below is for **after a supported patched upgrade and successful audit**.

Install the pinned npm tools outside the checkout (the Windows installer does
this automatically). `EASY_AGENT_TOOLS_DIR` contains `omniroute/` and `orca/` npm
prefixes; its cloud default is `/workspace/tools`.

```sh
npm install --prefix /workspace/tools/omniroute --save-exact --omit=dev omniroute@3.8.51
npm install --prefix /workspace/tools/orca --save-exact --omit=dev @blade-ai/orca@0.5.6
node scripts/developer-tools.mjs router
```

With Ollama running and `qwen3:1.7b` installed, use another terminal:

```sh
node scripts/developer-tools.mjs configure-router
```

Restart the router to apply the issued client key, then:

```sh
USE_OMNIROUTE=true node scripts/developer-tools.mjs probe
USE_OMNIROUTE=true node scripts/developer-tools.mjs app
```

The launcher generates random local credentials in ignored `.runtime/` files
with restrictive permissions. `configure-router` uses the local dashboard's real
login/key API; it does not fabricate a provider key. Read your local `adminToken`
privately to sign into the app. Do not publish `.runtime`, logs, or data backups.

`LOCAL_MODEL` changes the local model name. `OMNIROUTE_INSTALL_DIR` and
`ORCA_INSTALL_DIR` override the respective npm prefixes. Orca's connection uses
`ORCA_API_KEY`, `ORCA_BASE_URL`, `ORCA_MODEL` and a private `ORCA_HOME` via the
launcher. By default it targets Ollama's local OpenAI-compatible endpoint;
`ORCA_API_KEY=ollama` is a non-secret compatibility placeholder because local
Ollama does not authenticate API requests. It is not a provider credential.
Run `node scripts/developer-tools.mjs doctor` before using it. Its
sandbox is blocked by this cloud host's nested namespace restrictions; no
unsafe bypass was enabled.

## Application configuration

See `.env.example` for all defaults. Node 24–26 can read an ignored `.env` using
`npm start`. Launcher `app` defaults to direct local Ollama with token-protected
application access. The optional gateway path is explicitly selected and audited.

| Names | Meaning |
| --- | --- |
| `HOST`, `PORT` | Loopback binding and HTTP port by default |
| `ADMIN_TOKEN` | Founder bearer token, at least 24 characters |
| `AUTH_USERS_FILE` | Private JSON `[{"id":"owner","tokenHash":"sha256 hex"}]` |
| `LOCAL_DEV` | Explicit tokenless development; loopback only, never public |
| `DATA_DIR` | Private persistent controller/project data |
| `MODEL_PROTOCOL` | `ollama` or `openai` wire protocol |
| `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_API_KEY` | Actual endpoint/model/server-side credential |
| `MODEL_TIMEOUT_MS`, `MAX_OUTPUT_TOKENS` | Per-request limits |
| `MODEL_THINK` | Optional Ollama boolean; launcher disables thinking for the small starter model to reduce CPU latency |
| `TASK_TIMEOUT_MS`, `MAX_AGENT_STEPS` | Whole-task and tool-loop limits |
| `MAX_CONCURRENT_TASKS`, `MAX_TASKS_PER_DAY` | Default 2 concurrent/100 daily per owner |
| `COMMAND_TIMEOUT_MS`, `EXECUTOR_IMAGE` | Default 30 seconds after creation; `node:24-bookworm` |

Use an immutable, verified executor-image digest for a production deployment.
No real provider secrets are committed. Add paid keys only through a provider's
official account and the deployment's managed secret settings. Billing and quotas
are separate from application ownership. Configured provider catalogue access is
not a guarantee that any selected model is available.

## External access and deployment blockers

Native Git read/write authorization to the selected repository is separate from
an in-product GitHub OAuth/PR integration; the latter is not implemented.
Cloudflare and Stripe registry entries do not prove authenticated account access.
ChatGPT connectors do not automatically become server APIs or local MCP servers.
No plugins were silently installed into the user's ChatGPT/desktop applications.

The existing Sites source, project/publish contract, audience and rollback path
must be available before publication. This Node/filesystem/Docker controller is
not a drop-in Cloudflare Worker. Do not replace the requested hosting workflow.

The supplied repository has no existing authoritative product manager, checkout,
order store or webhook implementation. Stripe account/product/price definitions,
secret bindings and sandbox authorization are required before implementation can
reuse those features. No live payments or subscription terms were invented.

Official protocol references: [Ollama API](https://docs.ollama.com/api),
[OpenAI API reference](https://platform.openai.com/docs/api-reference).
Compatibility tests do not establish access to OpenAI's paid API or private Codex
schemas. Codex, Claude Code and Cursor retain their own authentication and terms.
