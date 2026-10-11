# Easy Agent engineering instructions

## Mission
Build a dependable, secure, lawful, revenue-producing AI development platform. Business success is measured by delivered customer value and verified payments, not projections.

## Before making changes
- Read README.md, package.json, and this file.
- Explain the user-visible change and any costs, access changes, or deployment risks.
- Work on a feature branch; produce a reviewable diff or pull request.
- Prefer small, maintainable, tested changes.
- Never claim an integration, OAuth grant, subscription, payment, or cloud environment is active until verified by its provider.

## Engineering workflow
1. Inspect the relevant code and current configuration.
2. Implement the smallest correct change.
3. Run `npm test` and `npm run check`; report failures accurately.
4. Check auth boundaries, logging, dependency provenance, data minimization, and error handling.
5. Summarize changed files, tests, operational risks, and rollback steps.

## Security and approvals
- Never commit passwords, API keys, OAuth tokens, cookies, customer records, or access credentials.
- Use providers' approved OAuth or secret-management controls; least privilege by default.
- Keep destructive actions, production deployments, purchases, account changes, financial transfers, customer messaging, and payment activation approval-gated.
- Prefer Stripe-hosted checkout and verified webhooks for any legitimate customer purchase.
- Enforce authorization, customer consent, rate limits and auditability. Do not create fraud, deceptive sales, unauthorized account access, or concealment systems.
- A registered MCP endpoint is not proof of authenticated and working access. Test each connection in isolation.

## Project-specific notes
- Node.js >= 20; runtime has no Node package dependencies by default.
- Local Ollama at 127.0.0.1 does **not** become accessible to Codex Cloud automatically.
- Cloud environment preparation should run `npm test` and `npm run check`.
- The public repository must contain only non-sensitive documents and code.
- For Codex Cloud setup, follow CODEX-CLOUD-SETUP.md.

## Business focus
Prioritize genuine prospect research, the A$2,950 starter delivery offer, transparent invoices, measured delivery costs, and customer retention. Never fabricate sales, revenue, testimonials, approvals, or returns.
