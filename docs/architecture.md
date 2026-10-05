# Architecture and trust boundaries

```text
Browser (in-memory access token)
  → Node controller: authentication + project ownership + task limits
    → trusted metadata, task history, Git database and checkpoints
    → model adapter → OmniRoute → Ollama (or explicitly configured provider)
    → file broker → project workspace
    → Docker command executor → only that project's bind mount
```

`src/server.js` exposes project/file/task/check/preview/artifact endpoints.
`src/auth.js` resolves bearer tokens to owners. `ADMIN_TOKEN` is the founder
identity; optional `AUTH_USERS_FILE` supplies SHA-256 token hashes and owner IDs.
There is no account signup, password recovery, OAuth session, or billing entitlement
system. Restart the controller to apply token configuration changes.

`src/projects.js` keeps each project's `workspace/`, `repository.git`, metadata
and snapshots separate. Only the workspace enters the executor. Host-side Git
disables hooks, global/system configuration, fsmonitor and external diff drivers.
File operations reject traversal and symlinks and serialize against execution.
Checkpoints preserve snapshots without moving the baseline HEAD, so checks do
not erase the visible diff. Restore is explicit and replaces current changes.

`src/tasks.js` stores task transitions and bounded events on disk. One task per
project and two tasks globally are the defaults. Restart marks incomplete tasks
interrupted; partial file changes and pre-task checkpoints remain reviewable.
This is an in-process scheduler, not a durable distributed worker queue.

`src/model-provider.js` supports Ollama `/api/chat` and OpenAI-compatible
`/v1/chat/completions`, including streaming tool calls, usage and cancellation.
Remote URLs require HTTPS; credentials/query strings and redirects are rejected.
Only a live request establishes inference readiness. A models catalogue probe
does not prove billing access or coding quality.

`src/executor.js` requires Docker; there is no host-shell fallback in the active
server. Workload containers have no network by default, no controller environment,
no daemon socket, non-root UID, read-only base, tmpfs scratch, dropped capabilities,
no-new-privileges, and CPU/memory/PID/output/runtime limits. Container creation is
bounded separately (up to 120 seconds); cancellation during creation is applied
before execution, not instantaneously. Normal completion, timeout and cancellation
remove the named container. A hard controller crash can require operator cleanup.

## Honest security limits

- Project bind mounts have no hard byte/inode quota. A malicious command can fill
  the host disk. Do not serve untrusted/public tenants without quota-backed
  storage and a separately managed execution boundary.
- Host file processing rejects trees above 50 MB, 2,000 entries or a five-second
  scan. Individual text files are limited to 1 MB, diffs to 5 MB, and compressed
  exports to 20 MB. These are processing limits, not filesystem enforcement.
- At most 100 projects globally/20 per owner and 100 checkpoints per project.
  Capacity exhaustion requires deliberate operator archival; nothing is silently
  deleted. Task history and Git object retention still require operational policy.
- The controller needs privileged Docker daemon access and parses project files
  using host Git/tar. Use a dedicated host/account and current security patches.
- There is no hostile-tenant red-team certification, OS-level network broker,
  hard storage isolation, identity lifecycle service or automatic crash recovery
  of orphan containers. This is not production readiness for public hosting.

The HTML preview is an opaque sandboxed iframe with a restrictive CSP. It is a
single-file preview, not a running framework/dev server. Project-relative assets
and arbitrary external networks are not served. Artifacts contain source, not
provider credentials or trusted metadata.

Agent OS is project guidance. Orca is an independent CLI; its native sandbox
doctor must pass before use. Neither inherits a Codex/Claude/Cursor subscription.
The existing MCP registry/client is not connected to the active agent's toolset.
External write-capable integrations and payment flows remain disabled/unavailable.
