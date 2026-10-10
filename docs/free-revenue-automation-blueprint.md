# Easy Agent: low-cost enquiry-to-revenue workflow

Status: design only; not installed, deployed, or connected to live billing.

## Goal
Convert inbound enquiries for a fixed-scope AI enquiry-and-booking setup into qualified, owner-approved proposals. Start with an A$2,950 implementation and optional A$299/month support (scope to be negotiated).

## Architecture
1. Existing Easy Agent website uses a consent-aware form to collect company, contact details, project needs, budget and marketing-consent choice.
2. API validates form fields, enforces rate limits, uses a submission idempotency key and stores a lead with access controls.
3. Optional self-hosted n8n receives a signed webhook, verifies signature, logs delivery and retries transient failures. Do not expose the editor publicly.
4. Optional Twenty CRM stores stages: new, qualified, awaiting approval, proposed, won, lost. Sync only with documented APIs and correctly scoped tokens.
5. Local Ollama drafts a lead summary and proposal for human review, never autonomously sends offers or promises outcomes.
6. Business owner approves outbound email via their connected provider. Record consent/opt-outs, unsubscribe requests and relevant legal obligations.
7. Stripe TEST checkout link can be prepared after customer approval. Verify webhooks server-side; never equate checkout creation with a successful payment.
8. Dashboard measures leads, qualified leads, approved proposals, paid clients, gross revenue, direct costs, and net ROI.

## Example monthly forecast — hypothetical, not guarantees
- 5 sales x A$2,950 = A$14,750 gross one-time setup revenue.
- ROI = (attributable revenue - delivery cost - lead acquisition cost - software and payment costs) / total attributable costs.
- Measure refunds and ongoing servicing expenses separately. Do not count invoices as received cash.

## Free-tier / license guardrails
- Ollama: local inference; PC compute/electricity still cost money.
- n8n: review its Sustainable Use License before any hosted or customer-facing resale.
- Twenty: inspect current licensing and deployment requirements before reuse.
- Cloudflare: free usage varies by product and quotas, and payment processing is not free.
- Never bypass paid subscriptions, authentication, rate limits, or website restrictions.

## Deployment checklist
- [ ] Desktop Commander device online and local dependencies inventoried
- [ ] Confirm Node.js, Docker, Ollama and available storage
- [ ] Set secret variables outside Git; rotate exposed secrets
- [ ] Confirm n8n and Twenty licenses fit intended business model
- [ ] Configure least-privilege OAuth/API access (no secrets in logs)
- [ ] Protect API endpoints with authentication, TLS, CSRF/rate limits and signature verification
- [ ] Implement data separation, access logging, retention/deletion and opt-out
- [ ] Test duplicate submissions, consent withdrawal, failed webhooks and provider downtime
- [ ] Test Stripe flows using test-mode credentials only
- [ ] Require human approval for outreach, pricing and live payments
- [ ] Budget alerts, monitoring, backups and incident rollback before production

## First acceptance test
Using fictional company data: submit a consented enquiry twice with the same idempotency key; confirm exactly one CRM entry, one owner notification, a proposal draft requiring approval, no external outreach or real charge, and auditable status updates.

## Current repo constraints
The existing MCP registry describes available services; it does not prove authentication. The current app uses a single agent loop. Integrate independently and incrementally, not by enabling every MCP at once.
