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
    validateWp002State(state).some((error) => error.includes("started without a recorded formal attempt"))
  );
});

test("accepts a recorded formal attempt only as aborted diagnostic evidence", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-001-ABORTED_DIAGNOSTIC"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-001",
    classification: "ABORTED_DIAGNOSTIC",
    formalValidation: false,
    characterizationEvidence: false,
    warmBudgetEvaluated: false,
    stackFailureEvidence: false,
    fallbackAuthorized: false
  }];

  assert.deepEqual(validateWp002State(state), []);
});

test("rejects treating an invalid warm set as budget, stack-failure, or fallback evidence", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-001-ABORTED_DIAGNOSTIC"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-001",
    classification: "ABORTED_DIAGNOSTIC",
    formalValidation: false,
    characterizationEvidence: false,
    warmBudgetEvaluated: true,
    stackFailureEvidence: true,
    fallbackAuthorized: true
  }];

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("warm budget")));
  assert.ok(errors.some((error) => error.includes("stack failure")));
  assert.ok(errors.some((error) => error.includes("fallback")));
});

test("accepts Attempt 002 performance evidence while zero-crash remains insufficient for gate", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-002-PERFORMANCE-ACCEPTED-CRASH-INSUFFICIENT"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-002",
    classification: "FORMAL_RUN_EVIDENCE_CANDIDATE",
    formalValidation: false,
    performanceEvidenceAccepted: true,
    warmEvidenceAccepted: true,
    zeroCrashCriterionEvidence: "INSUFFICIENT-FOR-GATE",
    stackFailureEvidence: false,
    fallbackAuthorized: false
  }];

  assert.deepEqual(validateWp002State(state), []);
});

test("rejects promoting Attempt 002 zero-crash or formal validation without complete evidence", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-002-PERFORMANCE-ACCEPTED-CRASH-INSUFFICIENT"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-002",
    classification: "FORMAL_RUN_EVIDENCE_CANDIDATE",
    formalValidation: true,
    performanceEvidenceAccepted: true,
    warmEvidenceAccepted: true,
    zeroCrashCriterionEvidence: "SUFFICIENT-FOR-GATE",
    stackFailureEvidence: false,
    fallbackAuthorized: false
  }];

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("formal validation")));
  assert.ok(errors.some((error) => error.includes("zero-crash")));
});
