# Operations and recovery

## Scope

Operate this release locally as a trusted developer. Keep loopback bindings,
authentication and resource limits. Do not expose it with port forwarding or a
public tunnel as a shortcut to production. Security updates, supervision, backups,
storage quotas and provider budget alerts are prerequisites to unattended hosting.

No program can guarantee 24/7 availability forever. Windows sleep, restarts,
power/network loss, thermal throttling and hardware faults stop local services.
Windows 10 standard support ended in October 2025; verify your edition's current
Microsoft security-support/ESU status and Docker's supported Windows requirements.
This installer does not alter power policy, enable remote access, disable Defender,
or create an administrative scheduled task. Start at login only after validating
the complete local workflow and choosing an appropriate service account.

## Startup and credentials

Start the supported Ollama installation, the local gateway, then the application
as documented. Processes do not survive a cloud filesystem snapshot or PC reboot.
`probe` checks API reachability; perform a real coding task before assuming the
model can execute tools. Do not confuse a healthy application with a healthy model.

Local credentials live under `.runtime`; project/task data under `data` by default.
Keep both private. Exclude them from source archives, support logs and screenshots.
Use a managed secret store for remote deployment. Rotation requires issuing a new
gateway key through its supported management interface and updating dependent
server-side configuration, then restarting affected processes. Revoke the old key
only after testing the replacement. Never share the founder token with other users.

## Backups and failure recovery

1. Stop accepting new tasks, cancel active tasks and wait for executor cleanup.
2. Stop the controller cleanly. Back up the entire data directory with file
   permissions, plus encrypted/private credentials separately.
3. Restore to a fresh private directory; start with its `DATA_DIR` and confirm
   owner access, history and a checkpoint restore before replacing working data.
4. After an interrupted task, inspect the diff. Retry deliberately or select
   Restore checkpoint (which replaces uncheckpointed project changes).
5. After a hard crash, inspect `docker ps -a --filter name=easy-agent-`. Verify
   exact container names/ownership before removing only abandoned Easy Agent
   containers. Do not prune unrelated Docker resources.

Check free bytes/inodes and Docker storage regularly. Each disposable container
can consume significant daemon storage, especially with Docker's `vfs` driver.
Project processing/checkpoint limits stop normal growth but cannot constrain a
malicious write through the workspace bind mount. Use quota-backed storage and a
separate execution host before untrusted use. Export and archive unused projects
deliberately; no retention cleanup is automated in this release.

## Builds and deployment

`npm run build` copies the application into `dist` without credentials or data.
It is packaging, not a deployed environment. `compose.yaml` is an optional
controller container; without a supported execution service and reachable model
it does not provide the complete coding workflow. Do not add a privileged daemon
socket mount to make it appear ready.

Publication remains through the owner's existing Sites workflow when its source,
build contract and authorization are supplied. Cloudflare provisioning, payment
activation, domain changes and audience changes were not performed.
