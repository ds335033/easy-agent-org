# Runtime boundaries

Keep owner identity server-side and check it on projects, files, tasks, event
streams, previews and exports. Never trust owner fields from browser requests.
Keep Git metadata, task metadata, checkpoints and credentials outside the mounted
execution workspace. Never run a model-provided command in the host shell.

Containers use only the project bind mount, resource limits, a read-only base,
no privileged capabilities, no network by default and no inherited credentials.
The Docker daemon remains trusted infrastructure; do not expose its socket.
For hostile public tenants use a separately managed execution service with disk
quotas and stronger OS isolation before offering multi-tenant hosting.

Use HTTPS for remote model APIs. Refuse redirects that might forward API keys.
Reject symlink/path escapes; serialize file operations against execution.
Never label OAuth services connected without a successful authorized operation.
