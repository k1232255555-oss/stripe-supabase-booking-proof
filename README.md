# Stripe + Supabase Booking Backend Proof

Small bounded backend proof created for current-task / paid-bounty applications.

## What it proves
- Stripe-compatible webhook signature verification from the raw body.
- Replay-window check.
- Safe ignore path for unrelated event types.
- Mapping `checkout.session.completed` into an idempotency-friendly billing record.
- Supabase/Postgres migration with:
  - booking holds,
  - billing receipts,
  - unique Stripe event/session/payment-intent identifiers,
  - constrained states/amounts,
  - RLS enabled with no public write policy.

## Run
```bash
npm test
```

The tests use only synthetic data and Node's standard library.

## Truth boundary
This is a self-built proof, not a claim of paid-client production Stripe ownership.
It does not contact Stripe or Supabase and does not use real API keys, payments, customer data, or a production database.

## Why the schema is idempotency-friendly
`stripe_event_id` and `stripe_session_id` are unique. A real server-side handler should insert/upsert only after signature verification and treat a duplicate event as already processed rather than charging or confirming twice.

## What a real client integration still requires
- official Stripe SDK or equivalent verified endpoint integration,
- server-side Supabase service-role access held outside the client,
- transaction/retry policy,
- slot-provider integration and compensation/recovery behavior,
- sandbox E2E tests,
- production secret management and monitoring.
