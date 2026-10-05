# Easy Agent GPT

Easy Agent GPT is a self-hosted coding workspace for founder-led development. It connects to Ollama or another compatible model endpoint, gives the model controlled file and shell tools, and provides a focused browser interface.

There are no application-level message or token quotas. Real capacity is limited by your hardware and by the terms and charges of any model provider you configure.

## Capabilities

- Multiple persistent coding workspaces
- Agent tool loop for reading, writing, shell commands, tests, and Git inspection
- Local Ollama native `/api/chat` inference
- Browser chat, file overview, Git summary, and direct terminal
- Optional bearer-token protection
- Non-root Docker deployment
- Zero Node package dependencies
- MCP Streamable HTTP discovery and namespaced tool execution
- Official Cloudflare MCP endpoint registry with explicit connection states

## Quick start with Ollama

Requirements: Node.js 20+ and [Ollama](https://ollama.com/).

```bash
ollama pull qwen3-coder
ollama serve
cp .env.example .env
set -a; . ./.env; set +a
npm start
```

Open `http://127.0.0.1:3000`. To use another installed model, set `MODEL_NAME`. The server calls Ollama's native `/api/chat` tool interface.

## Docker

Create a strong access token before exposing the service:

```bash
export ADMIN_TOKEN='replace-with-a-long-random-value'
docker compose up --build
```

When `ADMIN_TOKEN` is set, API requests need `Authorization: Bearer <token>`. The web client reads a token from the browser key `easy-agent-token`; set it in the browser console for a trusted local deployment:

```js
localStorage.setItem('easy-agent-token', 'your-token')
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen address |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `data/workspaces` | Persistent workspace root |
| `MODEL_BASE_URL` | `http://127.0.0.1:11434` | Ollama-compatible server |
| `MODEL_NAME` | `qwen3-coder` | Model identifier |
| `MODEL_API_KEY` | empty | Optional provider token |
| `ADMIN_TOKEN` | empty | Optional API bearer token |
| `MAX_AGENT_STEPS` | `8` | Tool-loop limit per request |
| `COMMAND_TIMEOUT_MS` | `30000` | Shell command timeout |
| `MCP_ENABLE` | empty | Comma-separated MCP server IDs to activate |

## Security model

The coding agent and direct terminal can execute arbitrary shell commands. Run it only for trusted users. Docker limits the process to a non-root container, but this is not a hardened multi-tenant sandbox. Do not mount sensitive host paths or the Docker socket. Put TLS and authentication in front of any Internet-facing deployment.

## Development

```bash
npm test
npm run check
npm run dev
npm run cloudflare:whoami
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

## Developer integrations

`config/integrations.json` separates MCP servers from ChatGPT-hosted connectors. A listed entry is not a claim that an account is connected. Enable MCP servers with `MCP_ENABLE=cloudflare-docs,cloudflare,stripe`; account services still require their official OAuth or token flow.

The Cloudflare registry uses the public official account, docs, bindings, builds, and observability MCP URLs. Wrangler runs through a pinned major-version npm command. Account authentication and deployment are separate operations and are not performed automatically.

Stripe CLI and Stripe MCP are separate. Use Stripe test mode and the official authentication flow; payment mutations should not be delegated without explicit review. Figma, TinyFish, Resend, Metricool, Outlook, Adobe, HeyGen, Google Drive, Gmail, GitHub, Slack, Documents, Pages, PDF, Presentations, Spreadsheets, Template Creator, and Plugin Management remain external ChatGPT capabilities until an authorized application API or MCP transport is supplied.

## Multi-agent direction

The current release runs one agent loop. The production roadmap supports a coordinator plus role-based workers (planning, implementation, testing, security, review, and documentation), with an upper configuration ceiling of 40 only after durable queues, isolated worktrees, budgets, and provider concurrency controls are implemented and verified.

## Founder ownership

The repository, deployment, workspaces, and local model data remain controlled by the operator. This project is independent software and is not affiliated with or a copy of OpenAI Codex Cloud.
