# BlackHole GitHub evaluation for Easy Agent Agency

Reviewed: 2026-10-11. Source: https://github.com/dppalukuri/BlackHole (public, default branch main).

## Conclusion

Selective **reference and adaptation**, not immediate deployment. The GitHub repository named BlackHole is branded TechTools365; it is not verified as related to blackhatmoney.website. It includes real code for static financial tools, freelance workflows, MCP scrapers, lead generation and CAPTCHA solving. Nothing in the inspection establishes that it generates revenue automatically or provides access to paid sites for free.

Top-level license: MIT, copyright 2026 dppalukuri. Preserve its license and copyright notice if using copied or substantially derived code. Review any third-party assets, dependencies, sites and APIs separately.

## Candidate reuse

| Source path | Value to Easy Agent | Decision |
| --- | --- | --- |
| freelance-bootstrap/engine/crm.py | Basic SQLite lead statuses and sales funnel modelling | **Reference only**; replace for authenticated, separated customer data |
| freelance-bootstrap/engine/outreach.py | Proposal and follow-up drafts | **Adapt** with evidence-based text and human send approval |
| freelance-bootstrap/engine/proposals.py | HTML proposal formatting | **Reference only**; HTML-escape all user-supplied fields and avoid invented case studies |
| freelance-bootstrap/engine/invoices.py | Basic invoice templates | **Reference only**; use local Australian requirements and independently verified payment state |
| data-products/pennymath/ | Examples of a fast static calculator site | **Consider** an original AUD ROI/savings calculator after verifying claims and formulas |
| data-products/tooljury/ | Comparisons of online tools | **Consider** original affiliate/editorial pages with transparent disclosures and firsthand verification |
| mcp-servers/google-maps/ | Lead research | **Do not install as-is**; review site terms, permissions, source provenance and data collection |
| mcp-servers/linkedin/ | Job/company/profile scraping with saved sessions | **Do not install as-is**; avoid automated restricted access and cookie-risk workflows |
| mcp-servers/serp-scraper/ | SEO research | **Do not install as-is**; prefer authorized APIs and source-compliant research |
| mcp-servers/captcha-solver/ | Automated challenge solving | **Exclude** from Easy Agent deployment; do not use it to evade access restrictions |

## Findings requiring fixes before any reuse

1. Proposal and invoice files embed user-provided client, project and description text into HTML without HTML escaping. A robust implementation must encode output, validate parameters and test hostile inputs.
2. The SQLite CRM stores contacts and notes in a local database but has no demonstrated multi-client access control, encryption at rest, data retention policy, audit boundaries or opt-out handling. Do not copy it into a public multi-tenant service.
3. The invoice CLI manually marks invoices as paid. This is not proof of settled funds. Recognize collected revenue only after an authenticated payment provider event or verified bank reconciliation.
4. The bundled strategy uses hypothetical revenue forecasts, marketing cost assumptions, and unverified affiliate commissions. Do not market these estimates as real Easy Agent results.
5. Some examples are UAE/India-oriented, including invoice tax examples and labour/visa assumptions. Australian tax, privacy, anti-spam, consumer and disclosure requirements need separate review before adaptation.
6. The scraper suite uses stealth browser components, logged-in sessions or CAPTCHA solvers; those features must not be treated as permission to access restricted data or circumvent controls.
7. Repository review is not a complete vulnerability scan, dependency audit, live runtime validation or current affiliate-program verification.

## Recommended Easy Agent build

First product: Australia-focused **Enquiry & Booking Automation** at an illustrative A$2,950 one-off setup + optional A$299/month support (subject to clear scope and real customer acceptance).

- Lead source: user-submitted enquiry forms or lawfully obtained business contact details with source tracking; never buy or scrape private contact lists.
- Offer: one concrete customer problem, measured delivery, clear terms and opt-out.
- Lead capture: idempotent form submission, rate limit, consent records and data retention.
- Qualification: local Ollama drafts summary/scores; label the score as advisory, with human validation.
- Pipeline: draft proposal -> owner approval -> send through an authorized account -> signed agreement.
- Payments: start only in Stripe test mode. Do not activate live charging or mass outreach without separate approval.
- Measurement: count leads, replies, signed deals, **settled receipts**, delivery costs, commissions, refunds and attributable customer-acquisition expenses.
- Safe automation: failures/retries, monitoring, spend caps, no external account changes without approval.

### Hypothetical gross revenue, not ROI or forecast

Three paid setups at A$2,950 each = A$8,850 gross receipts before any costs. Monthly support revenue applies only to actual ongoing paying subscribers.

ROI calculation: (attributable collected receipts minus attributable full costs) divided by attributable full costs. If costs are zero, ROI as a percentage is undefined; always record real labour, delivery, hosting and payment expenses.

## Acceptance criteria

- [ ] Test with fictional leads only
- [ ] Duplicate form submission creates one record
- [ ] Proposal drafts cannot auto-send
- [ ] HTML output escapes hostile client names/descriptions
- [ ] Client data access limited to its authorized tenant
- [ ] Consent withdrawal and deletion work
- [ ] Stripe test webhook signature validated and replays idempotent
- [ ] Fake paid invoice cannot count as verified cash
- [ ] Scraping/CAPTCHA tools are not installed or enabled
- [ ] Tests, source attribution and license notices included when necessary
- [ ] Windows/Desktop Commander online before any local installation attempt

## Execution state

This document is a due-diligence and implementation plan only. No code imported from BlackHole, no MCP server installed, no payments sent or collected, no website deployed, and no live customer data accessed. The Easy Agent primary branch remains unchanged until the draft PR is reviewed and merged.
