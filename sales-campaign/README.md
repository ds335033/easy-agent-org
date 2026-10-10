# Easy Agent Sales Campaign

## Offer
A$10,000 implementation; optional A$547/month support. Confirm GST, inclusions and third-party costs before launch.

## Funnel
Landing page → consent-based enquiry → CRM → qualification → booked consultation → proposal and agreement → Stripe test checkout → verified webhook → onboarding.

## Integration requirements
- Implement authenticated multi-tenant CRM with PostgreSQL and row-level security.
- Create server-only /api/leads with validation, rate limiting, CAPTCHA, deduplication and separate marketing consent.
- Deploy a dedicated campaign preview to Vercel, without replacing the existing Easy Agent coding app.
- Use Stripe test-mode keys server-side; charge AUD 1,000,000 cents for the setup only after contract acceptance. Never auto-enrol monthly support.
- Verify webhook signature, payment status and event idempotency; never trust browser payment confirmations.
- Record UTM attribution, stages, conversion events, delivery and refund metrics.
- Obtain appropriate consent for outreach and maintain unsubscribe/suppression workflows.

## Launch gates
1. Test form-to-CRM capture and duplicate handling.
2. Test consultation booking and lead permissions.
3. Test payment, webhook delivery and onboarding without real charges.
4. Review privacy, security, contractual scope and GST presentation.
5. Confirm actual installation capacity before increasing ad spend.

## Current verified status (11 October 2026)
GitHub repository accessible. Supabase returned no projects. Stripe surfaced a live-mode account; no test account was verified. Not deployed or production-connected.
