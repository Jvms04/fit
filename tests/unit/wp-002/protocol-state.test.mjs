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

test("accepts human-reviewed Attempt 003 for the S23 line without promoting SP-007 or VAL-001", () => {
  const state = structuredClone(baseState);
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-003-S23-LINE-ACCEPTED",
    nextFormalRun: "ATTEMPT-004-PROHIBITED"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-003",
    classification: "FORMAL_RUN_EVIDENCE_CANDIDATE",
    disposition: "S23-LINE-ACCEPTED-BY-HUMAN-REVIEW",
    formalValidation: false,
    performanceEvidenceAccepted: true,
    warmEvidenceAccepted: true,
    zeroCrashCriterionEvidence: "ACCEPTED-FOR-S23-LINE",
    runnerCriteriaMet: true,
    humanReview: "APPROVED-FOR-S23-LINE",
    completed: { cold: 30, warm: 30 },
    validSamples: { cold: 30, warm: 30 },
    crashEvidence: {
      checkpoints: 31,
      uniqueNewRecords: 29,
      expectedProtocolRecords: 29,
      abnormalRecords: 0,
      observedCrashes: 0
    },
    stackFailureEvidence: false,
    fallbackAuthorized: false
  }];

  assert.deepEqual(validateWp002State(state), []);
  assert.equal(state.protocols.find(({ id }) => id === "SP-007").status, "IN-PROGRESS");
  assert.equal(state.protocols.find(({ id }) => id === "VAL-001").status, "NOT-EXECUTED");
});

test("rejects S23 Attempt 003 acceptance with incomplete crash evidence or canonical promotion", () => {
  const state = structuredClone(baseState);
  state.protocols.find(({ id }) => id === "VAL-001").status = "PASS";
  state.platforms.androidPhysical.budgets = {
    status: "APPROVED-PREREGISTERED",
    formalRunStarted: true,
    formalRunResult: "ATTEMPT-003-S23-LINE-ACCEPTED",
    nextFormalRun: "ATTEMPT-004-PROHIBITED"
  };
  state.platforms.androidPhysical.formalAttempts = [{
    id: "SP007-S23-FORMAL-ATTEMPT-003",
    classification: "FORMAL_RUN_EVIDENCE_CANDIDATE",
    disposition: "S23-LINE-ACCEPTED-BY-HUMAN-REVIEW",
    formalValidation: true,
    performanceEvidenceAccepted: true,
    warmEvidenceAccepted: true,
    zeroCrashCriterionEvidence: "ACCEPTED-FOR-S23-LINE",
    runnerCriteriaMet: true,
    humanReview: "APPROVED-FOR-S23-LINE",
    completed: { cold: 30, warm: 30 },
    validSamples: { cold: 30, warm: 30 },
    crashEvidence: {
      checkpoints: 31,
      uniqueNewRecords: 28,
      expectedProtocolRecords: 29,
      abnormalRecords: 0,
      observedCrashes: 0
    },
    stackFailureEvidence: false,
    fallbackAuthorized: false
  }];

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("VAL-001") && error.includes("PASS")));
  assert.ok(errors.some((error) => error.includes("canonical formal validation")));
  assert.ok(errors.some((error) => error.includes("29 unique protocol force-stops")));
});

test("accepts only a partial Node 24 VAL-006 parcel while Hermes remains unresolved", () => {
  const state = structuredClone(baseState);
  state.protocols.find(({ id }) => id === "VAL-006").status = "PARTIAL";
  state.temporalNode24 = {
    status: "PARTIAL-EVIDENCE",
    runtime: "Node 24",
    dependencies: {
      temporalPolyfill: "0.5.1",
      momentTimezone: "0.6.3",
      tzdb: "2026c"
    },
    ruleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81",
    vectors: { matched: 5, total: 5 },
    skewDetected: true,
    consolidatedPreserved: true,
    futureUnconsolidatedReexpanded: true,
    canonicalPromotion: false,
    fallbackActivated: false,
    hermes: { android: "NOT-EXECUTED", ios: "BLOCKED" }
  };

  assert.deepEqual(validateWp002State(state), []);
});

test("rejects a Node-only VAL-006 parcel that claims promotion, fallback, or Hermes evidence", () => {
  const state = structuredClone(baseState);
  state.protocols.find(({ id }) => id === "VAL-006").status = "PARTIAL";
  state.temporalNode24 = {
    status: "PARTIAL-EVIDENCE",
    runtime: "Node 24",
    dependencies: {
      temporalPolyfill: "0.5.1",
      momentTimezone: "0.6.3",
      tzdb: "2026c"
    },
    ruleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81",
    vectors: { matched: 5, total: 5 },
    skewDetected: true,
    consolidatedPreserved: true,
    futureUnconsolidatedReexpanded: true,
    canonicalPromotion: true,
    fallbackActivated: true,
    hermes: { android: "PASS", ios: "PASS" }
  };

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("VAL-006") && error.includes("canonical")));
  assert.ok(errors.some((error) => error.includes("fallback")));
  assert.ok(errors.some((error) => error.includes("Hermes Android")));
  assert.ok(errors.some((error) => error.includes("Hermes iOS")));
});

test("rejects a Node 24 VAL-006 record with unpinned stack or incomplete vectors", () => {
  const state = structuredClone(baseState);
  state.protocols.find(({ id }) => id === "VAL-006").status = "PARTIAL";
  state.temporalNode24 = {
    status: "PARTIAL-EVIDENCE",
    runtime: "Node 24",
    dependencies: {
      temporalPolyfill: "latest",
      momentTimezone: "0.6.3",
      tzdb: "system"
    },
    ruleBaseId: "unversioned",
    vectors: { matched: 4, total: 5 },
    skewDetected: false,
    consolidatedPreserved: false,
    futureUnconsolidatedReexpanded: false,
    canonicalPromotion: false,
    fallbackActivated: false,
    hermes: { android: "NOT-EXECUTED", ios: "BLOCKED" }
  };

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("frozen temporal stack")));
  assert.ok(errors.some((error) => error.includes("rule_base_id")));
  assert.ok(errors.some((error) => error.includes("Node vectors")));
  assert.ok(errors.some((error) => error.includes("skew")));
  assert.ok(errors.some((error) => error.includes("consolidated")));
});

test("accepts Hermes Android preparation without treating it as runtime evidence", () => {
  const state = structuredClone(baseState);
  state.protocols.find(({ id }) => id === "VAL-006").status = "PARTIAL";
  state.temporalNode24 = {
    status: "PARTIAL-EVIDENCE",
    runtime: "Node 24",
    dependencies: {
      temporalPolyfill: "0.5.1",
      momentTimezone: "0.6.3",
      tzdb: "2026c"
    },
    ruleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81",
    vectors: { matched: 5, total: 5 },
    skewDetected: true,
    consolidatedPreserved: true,
    futureUnconsolidatedReexpanded: true,
    canonicalPromotion: false,
    fallbackActivated: false,
    hermes: { android: "NOT-EXECUTED", ios: "BLOCKED" }
  };
  state.temporalHermesAndroidPreparation = {
    status: "PREPARED-AWAITING-HUMAN-GATE",
    artifactName: "wp-002-android-probe",
    runtimeExecution: "NOT-EXECUTED",
    runtimeProof: "PENDING_PHYSICAL_EXECUTION",
    ruleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81",
    ruleBaseSha256: "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81",
    corpusSha256: "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141",
    vectors: { prepared: 5, executed: 0 },
    osTzdbDivergence: "NOT-EXECUTED",
    ios: "BLOCKED",
    canonicalPromotion: false,
    fallbackActivated: false
  };

  assert.deepEqual(validateWp002State(state), []);
});

test("rejects Hermes preparation that fabricates execution, promotion, or a different rule base", () => {
  const state = structuredClone(baseState);
  state.temporalHermesAndroidPreparation = {
    status: "PASS",
    artifactName: "wp-002-android-probe",
    runtimeExecution: "PASS",
    runtimeProof: "VERIFIED",
    ruleBaseId: "system-tzdb",
    ruleBaseSha256: "0".repeat(64),
    corpusSha256: "0".repeat(64),
    vectors: { prepared: 5, executed: 5 },
    osTzdbDivergence: "PASS",
    ios: "PASS",
    canonicalPromotion: true,
    fallbackActivated: true
  };

  const errors = validateWp002State(state);
  assert.ok(errors.some((error) => error.includes("Hermes Android preparation status")));
  assert.ok(errors.some((error) => error.includes("runtime execution")));
  assert.ok(errors.some((error) => error.includes("rule-base")));
  assert.ok(errors.some((error) => error.includes("corpus")));
  assert.ok(errors.some((error) => error.includes("OS-TZDB")));
  assert.ok(errors.some((error) => error.includes("iOS")));
  assert.ok(errors.some((error) => error.includes("canonical promotion")));
  assert.ok(errors.some((error) => error.includes("fallback")));
});
