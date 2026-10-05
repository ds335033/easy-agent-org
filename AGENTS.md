# Easy Agent development

Read `agent-os/standards/index.yml` and the relevant standard before a change.
Use the existing checkout and a feature branch. Preserve working code and local
user changes. Keep changes focused and carry implementation through verification.

The workflow is project → task → diff → checks → preview → approved publication.
Run `npm test`, `npm run check`, and `npm run build` before proposing a release.
Tests using a model fixture are contract tests; only successful real model calls
establish inference readiness. Document skipped and externally blocked checks.

Credentials belong in managed settings or ignored `.runtime/` files. Never print
keys, commit them, or include them in command arguments. Project tools must run
in the Docker executor with no controller secrets or daemon socket mounted.
Validate project ownership on every API path, including streams and artifacts.

Preserve the existing ChatGPT Sites audience and publication workflow. Do not
publish to a different host or activate live payments based on a local check.
Provider usage remains subject to provider billing and quotas.

Agent OS is a shared standards/specification layer, not an AI model or a source
of API credits. OmniRoute is the local API gateway; Orca is a separate CLI.
