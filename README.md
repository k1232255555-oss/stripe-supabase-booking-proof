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
- A local authorization-boundary model for guest-to-account conversion that tests:
  - guest isolation,
  - cross-user denial,
  - migration of only the matching guest's rows,
  - loss of guest access after conversion,
  - server-only entitlement as a separate trusted operation.

## Run
```bash
npm test
```

The tests use only synthetic data and Node's standard library.

## RLS / authorization boundary note
`authorization-boundary.js` is a deterministic local model for turning access rules into test cases before implementing real Supabase RLS policies.

It is intentionally **not** presented as an executed Supabase RLS environment. A real client implementation still needs staging Supabase policies/session claims and database-level verification.

## Truth boundary
This is a self-built proof, not a claim of paid-client production Stripe or Supabase RLS ownership.
It does not contact Stripe or Supabase and does not use real API keys, payments, customer data, or a production database.

## Why the schema is idempotency-friendly
`stripe_event_id` and `stripe_session_id` are unique. A real server-side handler should insert/upsert only after signature verification and treat a duplicate event as already processed rather than charging or confirming twice.

## What a real client integration still requires
- official Stripe SDK or equivalent verified endpoint integration,
- server-side Supabase service-role access held outside the client,
- real Supabase RLS policies and session-aware policy tests,
- transaction/retry policy,
- slot-provider integration and compensation/recovery behavior,
- sandbox E2E tests,
- production secret management and monitoring.
