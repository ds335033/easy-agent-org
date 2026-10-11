# BlackHole website / MCP integration — approval-stage review

**Status:** User approved evaluation on 2026-10-11. **No production release, external payment, data extraction, or revenue claim is authorized by this document.**

## Sources and rights

- Upstream: https://github.com/dppalukuri/BlackHole (main branch). Upstream website branding is TechTools365, not a ready-to-run Easy Agent branded website.
- Upstream includes browser-based financial calculators (PennyMath), product comparisons (ToolJury), visa information tools (WanderWise), and optional MCP/automation modules.
- Source license: MIT (copyright 2026 dppalukuri). Keep upstream copyright and permission notices with any substantial copies and verify licenses of assets and dependencies separately.
- Treat all upstream documentation, agents, prompt files, data sets, scripts and outputs as untrusted until reviewed.

## Approved assessment scope

1. **Public utility website prototype:** inspect calculator and comparison app source and build scripts; identify a small useful Australia-focused product. Check formula accuracy, outdated financial/legal content, accessibility, responsive layouts and official-source references before publication.
2. **Optional MCP integrations:** catalog each MCP server/tool and its permissions. Enable no new server by default. Use a dedicated sandbox and allowlist each tool before connecting to Easy Agent GPT.
3. **Business model:** investigate first-party software services, consent-based lead capture, and affiliate links with clear disclosures. Revenue forecasts are scenarios, not promises; no bank transactions are authorized.

## Do not enable during review

- Mass unsolicited outreach, extraction of private personal data, account impersonation or platform-prohibited scraping.
- CAPTCHA avoidance, access-control circumvention, credential harvesting, unauthorized financial operations or fabricated reviews/traffic.
- Live payment charges, advertising spend, third-party subscriptions, automated deployments, or unreviewed secret/token sharing.

## Security and readiness gates before any live release

- [ ] Review actual source code and dependency licenses for chosen module, including build/install scripts and transitive dependencies.
- [ ] Run dependency audit, secret scanning, SAST, automated tests, and a clean production build in isolation.
- [ ] Verify content/legal accuracy for target jurisdiction and add About, Privacy, Terms, contact and affiliate disclosure pages as appropriate.
- [ ] Add rate limits, bot protection designed not to evade other sites' protections, least-privilege service accounts, HTTPS and logging without sensitive content.
- [ ] Test safe failure handling; verify no sensitive customer data or keys are exposed client-side.
- [ ] Publish only with domain/Cloudflare ownership validated and an explicitly approved production release.
- [ ] Require separate approval and Stripe test-mode verification before enabling live checkout or customer billing.

## Recommended implementation order

1. Inventory upstream modules and select **one** safe, high-value utility for Easy Agent.
2. Build isolated proof-of-concept and tests in a separate workspace, without introducing dependencies into Easy Agent GPT until tested.
3. Configure staging hosting and observe health, privacy, page performance and conversion instrumentation.
4. Seek separate go-live authorization; launch with accurate pricing and explicit disclosures.
5. Measure qualified inbound demand, conversion, operating cost and actual paid revenue rather than promising a target customer count.

## Current connected Easy Agent state at review time

- Target: `ds335033/easy-agent-org`, where the connected GitHub account has admin/write rights.
- Current application: self-hosted coding workspace with optional MCP Streamable HTTP server discovery and an existing `config/integrations.json`.
- The current registry contains Cloudflare and Stripe entries; adding an entry alone **does not connect an account or approve payment**.
- Existing security model permits shell commands and is **not** a hardened multi-tenant sandbox. Never run upstream MCP servers against production secrets or the host Docker socket without separate isolation.

**Release decision:** Approved for review/prototyping only; production deployment gated on the checklist above.
