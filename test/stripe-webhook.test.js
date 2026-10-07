"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildResponse,
  signPayload,
  verifyStripeWebhook,
} = require("../stripe-webhook");

const secret = "whsec_test_only_not_real";
const now = 1791374400;

function event(overrides = {}) {
  return {
    id: "evt_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_intent: "pi_123",
        amount_total: 20000,
        currency: "usd",
        payment_status: "paid",
        metadata: { booking_id: "11111111-1111-4111-8111-111111111111" },
      },
    },
    ...overrides,
  };
}

function signed(rawBody, timestamp = now) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, rawBody)}`;
}

test("accepts a correctly signed checkout completion", () => {
  const rawBody = JSON.stringify(event());
  const parsed = verifyStripeWebhook({
    rawBody,
    signatureHeader: signed(rawBody),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.equal(parsed.id, "evt_123");
});

test("rejects a tampered body even when the original signature is reused", () => {
  const original = JSON.stringify(event());
  const tampered = JSON.stringify(event({ id: "evt_tampered" }));
  const result = buildResponse({
    rawBody: tampered,
    signatureHeader: signed(original),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "SIGNATURE_MISMATCH");
});

test("rejects an old replay timestamp", () => {
  const rawBody = JSON.stringify(event());
  const old = now - 301;
  const result = buildResponse({
    rawBody,
    signatureHeader: signed(rawBody, old),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "TIMESTAMP_OUTSIDE_TOLERANCE");
});

test("maps checkout session to an idempotent database record", () => {
  const rawBody = JSON.stringify(event());
  const result = buildResponse({
    rawBody,
    signatureHeader: signed(rawBody),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.record, {
    stripe_event_id: "evt_123",
    stripe_session_id: "cs_test_123",
    stripe_payment_intent_id: "pi_123",
    booking_id: "11111111-1111-4111-8111-111111111111",
    amount_total: 20000,
    currency: "usd",
    payment_status: "paid",
  });
});

test("ignores unrelated Stripe event types safely", () => {
  const rawBody = JSON.stringify(event({ id: "evt_other", type: "customer.created" }));
  const result = buildResponse({
    rawBody,
    signatureHeader: signed(rawBody),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.deepEqual(result, {
    status: 200,
    body: { ok: true, ignored: true, event_id: "evt_other" },
  });
});

test("requires metadata.booking_id for the bounded flow", () => {
  const broken = event();
  delete broken.data.object.metadata.booking_id;
  const rawBody = JSON.stringify(broken);
  const result = buildResponse({
    rawBody,
    signatureHeader: signed(rawBody),
    endpointSecret: secret,
    nowSeconds: now,
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "MISSING_BOOKING_ID");
});
