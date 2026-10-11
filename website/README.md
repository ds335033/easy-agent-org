# Easy Agent public sales site

This standalone static website is deliberately isolated from the private Easy Agent GPT coding agent at the repository root. Never publicly deploy the root application or expose the agent's shell/file APIs.

## Local preview

From the repository root:

```sh
npx --yes serve website
```

The public site uses HTML, CSS and JavaScript without dependencies, external scripts, API keys, cookies, remote fonts, forms, Stripe credentials or unverified testimonials. The ROI calculator is local and illustrative, not an income guarantee. Contact uses a public LinkedIn profile, not a fake enquiry endpoint. It displays proposed service prices and does not charge customers.

## AWS launch checklist — not yet deployed

1. Sign in to the intended AWS account through IAM Identity Center or the official AWS MCP OAuth browser flow. Check the caller's Account value equals the account ID supplied by the account owner. An account number alone is not authorization.
2. Review region, IAM least privilege, MFA, cost budgets, alerts and deployment spend. Prefer a managed static-site/CDN service with HTTPS (e.g. Amplify Hosting) and an approved GitHub deployment connection.
3. Point a verified, owned website hostname to the new static deployment only after DNS and SSL verification. Do not replace an existing production site without checking its ownership and current routing.
4. Configure canonical domain, security headers, uptime monitoring and caching. Confirm page loading, responsive and keyboard use, calculator controls and no console/network errors.
5. Before a real lead form: add a server-side endpoint, anti-spam, consent, retention policy, verified email delivery, error alerts, admin authentication and customer-data separation. Update privacy copy to name the actual controller and processors.
6. Before checkout: complete the written proposal, GST/terms/refunds, confirm Stripe price and live payment-link line items (including quantity), then add only the verified link for that exact service. Ensure webhooks and fulfilment are tested. Never put secret keys in this site or repository.
7. Do not assume a ChatGPT/Codex subscription funds OpenAI API usage or AWS consumption; configure their billing independently and impose service budgets.

## AWS/Codex developer tooling

Codex already has official OpenAI documentation and AWS MCP endpoints registered in the owner's local configuration. An enabled registry entry is not authenticated access. Browser OAuth approval and AWS identity verification are required before any cloud changes.

## Safety and commercial claims

The listed A$2,950 setup and A$299/month optional care offer are proposed fixed-scope services. Confirm scope, contract, service capacity, fulfilment and any GST treatment before publishing for real purchasers. No unverified ROI claims, fabricated clients or automated sales promises.
