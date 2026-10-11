# Codex Cloud setup for Easy Agent

**Verified 2026-10-11:** GitHub `ds335033` connected through the ChatGPT GitHub integration with admin access to `ds335033/easy-agent-org`. Desktop Commander device was online. Local Codex CLI `0.157.1` reported `Logged in using ChatGPT`. These checks **do not prove Codex Cloud is authorized or published**.

## Create and publish the cloud environment (requires your account interaction)
1. Sign in to **https://chatgpt.com/codex** with the intended ChatGPT account/workspace.
2. On desktop or web, choose **Work in > Cloud > Select environment > Create environment** (or **Settings > Codex Cloud > Environments**).
3. Connect your own GitHub account when prompted and select `ds335033/easy-agent-org`. A ChatGPT GitHub connector does not by itself grant every Codex environment access.
4. Have Codex prepare the repository. Use Node.js 20+ and run:
   ```powershell
   node --version
   npm --version
   npm test
   npm run check
   ```
5. Review the generated setup report, repository permissions, network allowlist, and environment access. Use **Only me** while testing.
6. Do not add secrets to committed files. For provider credentials, use the environment's approved **Environment variables** or destination-restricted **Network secrets** controls.
7. Select **Publish**, then start a new cloud task and verify it can read the repository, execute tests, and propose a branch/PR. Do not assume success before that test passes.

## Suggested first Codex Cloud task
`In ds335033/easy-agent-org, inspect the Node project, run npm test and npm run check, report any failures, and propose a small reviewed PR that improves security or error handling. Do not modify live payments, environment secrets, DNS, or production deployments.`

## Model providers and connectivity
- The README defaults to local Ollama at `http://127.0.0.1:11434`, which resolves inside the cloud VM, **not** on the user's Windows PC. Do not expose unauthenticated Ollama over the public internet.
- Use approved provider endpoints and secure credentials only when required for development. Cloud access to private services needs explicitly configured, authenticated connectivity.
- Local `codex mcp list` reflects registrations and enabled flags, not an end-to-end health check. Validate tools individually.

## Troubleshooting and verification
- If Cloud is missing, verify the ChatGPT account, plan availability and workspace permissions; some workspaces restrict cloud access.
- If repo is missing, check the Codex GitHub authorization and environment repository list.
- If builds fail, report exact failing dependency, command and test; fix and republish.
- Review usage limits in ChatGPT **Settings > Usage**. Do not attempt to bypass allowances or create unapproved credit.
- Verify a new cloud task works after publishing. Separate tasks have independent file state.

Official reference: https://developers.openai.com/codex/environments/cloud-environments
