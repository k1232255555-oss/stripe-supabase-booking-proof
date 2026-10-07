"use strict";

const crypto = require("node:crypto");

const DEFAULT_TOLERANCE_SECONDS = 300;

class WebhookError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebhookError";
    this.code = code;
  }
}

function parseStripeSignature(header) {
  if (typeof header !== "string" || !header.trim()) {
    throw new WebhookError("MISSING_SIGNATURE", "Stripe-Signature header is required.");
  }

  const values = {};
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    (values[key] ??= []).push(value);
  }

  const timestamp = Number(values.t?.[0]);
  const signatures = values.v1 ?? [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new WebhookError("INVALID_SIGNATURE_HEADER", "Stripe-Signature header is malformed.");
  }
  return { timestamp, signatures };
}

function signPayload(secret, timestamp, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

function secureHexEqual(a, b) {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyStripeWebhook({
  rawBody,
  signatureHeader,
  endpointSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}) {
  if (typeof rawBody !== "string") {
    throw new WebhookError("INVALID_BODY", "Webhook body must be the original raw UTF-8 string.");
  }
  if (typeof endpointSecret !== "string" || !endpointSecret) {
    throw new WebhookError("MISSING_SECRET", "Webhook endpoint secret is required.");
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new WebhookError("TIMESTAMP_OUTSIDE_TOLERANCE", "Webhook timestamp is outside tolerance.");
  }

  const expected = signPayload(endpointSecret, timestamp, rawBody);
  if (!signatures.some((signature) => secureHexEqual(signature, expected))) {
    throw new WebhookError("SIGNATURE_MISMATCH", "Webhook signature mismatch.");
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new WebhookError("INVALID_JSON", "Webhook body is not valid JSON.");
  }

  if (!event || typeof event !== "object" || typeof event.id !== "string" || typeof event.type !== "string") {
    throw new WebhookError("INVALID_EVENT", "Webhook event is missing id/type.");
  }

  return event;
}

function checkoutCompletionRecord(event) {
  if (event.type !== "checkout.session.completed") return null;
  const session = event.data?.object;
  if (!session || typeof session !== "object") {
    throw new WebhookError("INVALID_SESSION", "checkout.session.completed is missing session data.");
  }

  const bookingId = session.metadata?.booking_id;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  if (typeof bookingId !== "string" || !bookingId) {
    throw new WebhookError("MISSING_BOOKING_ID", "Session metadata.booking_id is required.");
  }

  return {
    stripe_event_id: event.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    booking_id: bookingId,
    amount_total: Number.isInteger(session.amount_total) ? session.amount_total : null,
    currency: typeof session.currency === "string" ? session.currency : null,
    payment_status: typeof session.payment_status === "string" ? session.payment_status : null,
  };
}

function buildResponse({ rawBody, signatureHeader, endpointSecret, nowSeconds }) {
  try {
    const event = verifyStripeWebhook({ rawBody, signatureHeader, endpointSecret, nowSeconds });
    const record = checkoutCompletionRecord(event);
    if (!record) {
      return { status: 200, body: { ok: true, ignored: true, event_id: event.id } };
    }
    return { status: 200, body: { ok: true, record } };
  } catch (error) {
    if (error instanceof WebhookError) {
      return { status: 400, body: { ok: false, code: error.code } };
    }
    return { status: 500, body: { ok: false, code: "INTERNAL_ERROR" } };
  }
}

module.exports = {
  DEFAULT_TOLERANCE_SECONDS,
  WebhookError,
  buildResponse,
  checkoutCompletionRecord,
  parseStripeSignature,
  signPayload,
  verifyStripeWebhook,
};
