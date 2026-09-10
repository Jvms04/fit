import assert from "node:assert/strict";
import test from "node:test";

import { validateWp002State } from "../../performance/wp-002/lib/protocol-state.mjs";

const baseState = {
  wp: "WP-002",
  status: "In Progress",
  val025: "NOT-EXECUTED",
  protocols: [
    { id: "SP-007", status: "IN-PROGRESS" },
    { id: "VAL-001", status: "NOT-EXECUTED" },
    { id: "VAL-003", status: "NOT-EXECUTED" },
    { id: "VAL-004", status: "NOT-EXECUTED" },
    { id: "VAL-006", status: "NOT-EXECUTED" },
    { id: "VAL-011", status: "BLOCKED" },
    { id: "VAL-016@P0", status: "INCONCLUSIVE" }
  ],
  platforms: {
    androidPhysical: {
      device: "Samsung Galaxy S23",
      os: "Android 16",
      status: "NOT-EXECUTED",
      budgets: { formalRunStarted: false }
    },
    iosPhysical: { status: "BLOCKED", reason: "No iPhone/macOS/Xcode/provisioning available" }
  }
};

test("accepts an incomplete WP-002 state without promoting a validation", () => {
  assert.deepEqual(validateWp002State(baseState), []);
});

test("rejects PASS and accidental VAL-025 execution", () => {
  const state = structuredClone(baseState);
  state.protocols[1].status = "PASS";
  state.val025 = "PASS";

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("VAL-001") && error.includes("PASS")));
  assert.ok(errors.some((error) => error.includes("VAL-025")));
});

test("requires the physical iOS gap to stay explicit", () => {
  const state = structuredClone(baseState);
  state.platforms.iosPhysical = { status: "NOT-EXECUTED" };

  assert.ok(validateWp002State(state).some((error) => error.includes("iOS")));
});

test("rejects an aborted diagnostic attempt promoted as characterization evidence", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.diagnosticAttempts = [{
    id: "SP007-S23-ATTEMPT-001",
    classification: "ABORTED-DIAGNOSTIC",
    characterizationEvidence: true,
    resultFile: "INVALID-ZERO-BYTES"
  }];

  assert.ok(
    validateWp002State(state).some((error) => error.includes("aborted diagnostic"))
  );
});

test("rejects recording the formal S23 run as started during preparation", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true
  };

  assert.ok(
    validateWp002State(state).some((error) => error.includes("formal S23 run must remain not started"))
  );
});
