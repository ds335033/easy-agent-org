# Validation evidence — 2026-10-05

This is cloud/Linux development evidence, not Windows or production certification.

## Completed checks

- Repository suite: 33 tests passed, zero skipped, including actual Docker
  non-root execution, secret/mount boundaries, timeout and output limits.
- Protocol tests: Ollama and OpenAI-compatible streaming, multi-tool parsing,
  truncated streams, cancellation, request schemas and sanitized failures.
- HTTP/project tests: authentication, cross-user denial, traversal/symlink denial,
  bounded file processing, task persistence, checks, diffs, previews and exports.
- JavaScript syntax checks and distribution packaging completed successfully.
- Chromium at 390, 768 and 1440 pixels: authenticated workspace, task history,
  file editor, diff/preview views, keyboard focus and no horizontal overflow.
- Source/private-credential comparison found no generated local credentials in
  the files proposed for Git. This is not a third-party secret-scanner audit.

The npm test command targets only the application's `test/*.test.js`; arbitrary
user project tests under `data/` run separately in Docker, never in the controller's
test runner. An earlier broad discovery run accidentally included diagnostic
project snapshots and exposed this boundary issue; the command was corrected.

## Real inference versus fixtures

A real `qwen3:1.7b` model was downloaded from Ollama's official registry with each
layer's SHA-256 verified. Real gateway inference and a project edit/check/repair/
preview journey passed before the security audit disabled OmniRoute. Checks
caught a model-generated missing title; a real repair task corrected it. This is
evidence for review/check/recovery, not proof that the model always writes correct
code. HTTP unit tests use a deterministic model/executor fixture and are labelled
separately from those live runs.

The default was subsequently switched to direct local Ollama. A native-streaming
tool assembly defect was found by live testing and fixed with a regression test.
Machine-readable latest live results are kept privately in
`.runtime/live-validation.json`, never committed with credentials or task data.
The native Ollama edit → failed check → model repair → passing check → preview
journey also passed at 12:29 UTC with the diff preserved. This directly validated
the fallback independently of the disabled gateway.

## Security holds and unverified capabilities

- OmniRoute 3.8.51: `npm audit --omit=dev` reported 11 findings (3 moderate,
  3 high, 5 critical, including transitive inherited findings). Its installed
  Next.js version falls in GHSA-vcvr-r3jv-pc5j's reported range. The gateway was
  stopped; its launch/configuration path now fails closed on high/critical findings
  or an unverifiable audit. No patched-release or exploitability claim is made.
- Orca 0.5.6: npm audit reported zero findings, but its doctor **failed** native
  sandbox enforcement in this host. Connection configuration is present; agent
  execution is not verified and the sandbox was not bypassed.
- Agent OS's five upstream Claude commands and shared Codex/Cursor instructions
  are installed. Codex, Claude Code and Cursor product authentication/installation
  on the user's PC is not established by those instruction files.
- Windows PowerShell installer: prepared and reviewed, not executed on Windows.
  No 24/7 supervision, power-policy change, or unattended Windows service was set up.
- No hard host-storage quotas; no public hostile-tenant readiness.
- No Stripe sandbox transaction, live checkout, webhook verification or refund
  test. Existing payment source/account authorization remains missing.
- No connected GitHub OAuth/PR UI, remote plugin OAuth, Cloudflare deployment,
  Sites publication, audience change or verified production behavior.

Native Git repository authorization, local tests and cloud snapshot configuration
are separate from an application deployment. Future tasks must restart processes
and revalidate model/executor readiness; a filesystem snapshot does not keep
processes running.
