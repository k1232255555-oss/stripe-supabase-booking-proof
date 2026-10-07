"use strict";

function guestPrincipal(guestId) {
  return { kind: "guest", guestId };
}

function userPrincipal(userId) {
  return { kind: "user", userId };
}

function canAccessProgress(principal, row) {
  if (!principal || !row) return false;

  if (row.ownerUserId) {
    return principal.kind === "user" && principal.userId === row.ownerUserId;
  }

  if (row.ownerGuestId) {
    return principal.kind === "guest" && principal.guestId === row.ownerGuestId;
  }

  return false;
}

function convertGuestRows(rows, guestId, userId) {
  if (!guestId || !userId) throw new TypeError("guestId and userId are required");

  return rows.map((row) => {
    if (row.ownerGuestId !== guestId) return { ...row };
    if (row.ownerUserId) throw new Error("row already has authenticated owner");

    return {
      ...row,
      ownerGuestId: null,
      ownerUserId: userId,
      convertedFromGuestId: guestId,
    };
  });
}

function serverGrantEntitlement(row, entitlement) {
  if (!row || !row.ownerUserId) {
    throw new Error("authenticated owner required");
  }
  return { ...row, entitlement };
}

module.exports = {
  guestPrincipal,
  userPrincipal,
  canAccessProgress,
  convertGuestRows,
  serverGrantEntitlement,
};
