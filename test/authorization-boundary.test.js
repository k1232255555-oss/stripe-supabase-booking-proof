"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  guestPrincipal,
  userPrincipal,
  canAccessProgress,
  convertGuestRows,
  serverGrantEntitlement,
} = require("../authorization-boundary");

const guestA = guestPrincipal("guest-a");
const guestB = guestPrincipal("guest-b");
const userA = userPrincipal("user-a");
const userB = userPrincipal("user-b");

function guestRow(id, guestId) {
  return { id, ownerGuestId: guestId, ownerUserId: null, progress: 25 };
}

test("guest can access only its own progress", () => {
  const row = guestRow("r1", "guest-a");
  assert.equal(canAccessProgress(guestA, row), true);
  assert.equal(canAccessProgress(guestB, row), false);
});

test("conversion migrates only matching guest rows", () => {
  const rows = [guestRow("a1", "guest-a"), guestRow("b1", "guest-b")];
  const next = convertGuestRows(rows, "guest-a", "user-a");

  assert.equal(next[0].ownerGuestId, null);
  assert.equal(next[0].ownerUserId, "user-a");
  assert.equal(next[0].convertedFromGuestId, "guest-a");
  assert.equal(next[1].ownerGuestId, "guest-b");
  assert.equal(next[1].ownerUserId, null);
});

test("authenticated owner can access migrated row", () => {
  const [row] = convertGuestRows([guestRow("a1", "guest-a")], "guest-a", "user-a");
  assert.equal(canAccessProgress(userA, row), true);
});

test("old guest identity loses access after conversion", () => {
  const [row] = convertGuestRows([guestRow("a1", "guest-a")], "guest-a", "user-a");
  assert.equal(canAccessProgress(guestA, row), false);
});

test("different authenticated user cannot access migrated row", () => {
  const [row] = convertGuestRows([guestRow("a1", "guest-a")], "guest-a", "user-a");
  assert.equal(canAccessProgress(userB, row), false);
});

test("conversion cannot claim another guest's row", () => {
  const [row] = convertGuestRows([guestRow("b1", "guest-b")], "guest-a", "user-a");
  assert.equal(row.ownerGuestId, "guest-b");
  assert.equal(row.ownerUserId, null);
});

test("already-owned row fails closed", () => {
  const row = { id: "mixed", ownerGuestId: "guest-a", ownerUserId: "existing-user" };
  assert.throws(
    () => convertGuestRows([row], "guest-a", "user-a"),
    /already has authenticated owner/
  );
});

test("server-only entitlement requires authenticated ownership", () => {
  const [row] = convertGuestRows([guestRow("a1", "guest-a")], "guest-a", "user-a");
  const entitled = serverGrantEntitlement(row, "paid");
  assert.equal(entitled.entitlement, "paid");
  assert.throws(
    () => serverGrantEntitlement(guestRow("g1", "guest-a"), "paid"),
    /authenticated owner required/
  );
});
