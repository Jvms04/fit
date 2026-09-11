const EXPECTED_PROTOCOLS = [
  "SP-007",
  "VAL-001",
  "VAL-003",
  "VAL-004",
  "VAL-006",
  "VAL-011",
  "VAL-016@P0"
];

const ALLOWED_STATUSES = new Set([
  "NOT-EXECUTED",
  "IN-PROGRESS",
  "PARTIAL",
  "BLOCKED",
  "INCONCLUSIVE",
  "SUFFICIENT-FOR-GATE",
  "INSUFFICIENT-FOR-GATE"
]);

export function validateWp002State(state) {
  const errors = [];

  if (state?.wp !== "WP-002") {
    errors.push("state must belong to WP-002");
  }
  if (state?.val025 !== "NOT-EXECUTED") {
    errors.push("VAL-025 must remain NOT-EXECUTED during WP-002");
  }

  const byId = new Map((state?.protocols ?? []).map((protocol) => [protocol.id, protocol]));
  for (const id of EXPECTED_PROTOCOLS) {
    const protocol = byId.get(id);
    if (!protocol) {
      errors.push(`${id} is missing from WP-002 state`);
      continue;
    }
    if (protocol.status === "PASS") {
      errors.push(`${id} cannot be marked PASS by WP-002 preparation or partial evidence`);
    } else if (!ALLOWED_STATUSES.has(protocol.status)) {
      errors.push(`${id} has unsupported status '${protocol.status}'`);
    }
  }

  const ios = state?.platforms?.iosPhysical;
  if (ios?.status !== "BLOCKED" || !ios.reason) {
    errors.push("physical iOS evidence must remain explicitly BLOCKED with a reason");
  }

  const diagnosticAttempts = state?.platforms?.androidPhysical?.diagnosticAttempts ?? [];
  if (diagnosticAttempts.some((attempt) =>
    attempt.classification === "ABORTED-DIAGNOSTIC" && attempt.characterizationEvidence !== false
  )) {
    errors.push("an aborted diagnostic attempt cannot be promoted as characterization evidence");
  }

  const android = state?.platforms?.androidPhysical;
  const formalRunStarted = android?.budgets?.formalRunStarted;
  const formalAttempts = android?.formalAttempts ?? [];
  if (formalRunStarted === true && formalAttempts.length === 0) {
    errors.push("formal S23 run was marked started without a recorded formal attempt");
  } else if (formalRunStarted === false && formalAttempts.length > 0) {
    errors.push("recorded formal attempts require formalRunStarted to reflect that execution occurred");
  } else if (formalRunStarted !== true && formalRunStarted !== false) {
    errors.push("formalRunStarted must be an explicit boolean");
  }

  for (const attempt of formalAttempts) {
    const id = attempt.id ?? "formal attempt";
    if (attempt.classification === "ABORTED_DIAGNOSTIC") {
      if (attempt.formalValidation !== false || attempt.characterizationEvidence !== false) {
        errors.push(`${id} must remain aborted diagnostic evidence only`);
      }
      if (attempt.warmBudgetEvaluated !== false) {
        errors.push(`${id} cannot evaluate the warm budget without a valid warm set`);
      }
    } else if (attempt.classification === "FORMAL_RUN_EVIDENCE_CANDIDATE") {
      if (attempt.formalValidation !== false) {
        errors.push(`${id} cannot claim canonical formal validation`);
      }
      if (attempt.performanceEvidenceAccepted !== true || attempt.warmEvidenceAccepted !== true) {
        errors.push(`${id} must preserve the independently accepted performance and warm evidence`);
      }
      if (attempt.zeroCrashCriterionEvidence === "ACCEPTED-FOR-S23-LINE") {
        if (
          attempt.disposition !== "S23-LINE-ACCEPTED-BY-HUMAN-REVIEW" ||
          attempt.humanReview !== "APPROVED-FOR-S23-LINE" ||
          attempt.runnerCriteriaMet !== true
        ) {
          errors.push(`${id} S23 acceptance requires runner criteria and explicit human review`);
        }
        if (
          attempt.completed?.cold !== 30 ||
          attempt.completed?.warm !== 30 ||
          attempt.validSamples?.cold !== 30 ||
          attempt.validSamples?.warm !== 30
        ) {
          errors.push(`${id} S23 acceptance requires exactly 30/30 valid cold and warm samples`);
        }
        const crash = attempt.crashEvidence;
        if (
          crash?.checkpoints !== 31 ||
          crash?.uniqueNewRecords !== 29 ||
          crash?.expectedProtocolRecords !== 29 ||
          crash?.abnormalRecords !== 0 ||
          crash?.observedCrashes !== 0
        ) {
          errors.push(`${id} S23 acceptance requires 31 checkpoints and 29 unique protocol force-stops with zero abnormal exits/crashes`);
        }
        if (android?.budgets?.nextFormalRun !== "ATTEMPT-004-PROHIBITED") {
          errors.push(`${id} must preserve the prohibition on Formal Attempt 004`);
        }
      } else if (attempt.zeroCrashCriterionEvidence !== "INSUFFICIENT-FOR-GATE") {
        errors.push(`${id} has unsupported zero-crash evidence '${attempt.zeroCrashCriterionEvidence}'`);
      }
    } else {
      errors.push(`${id} has unsupported formal-attempt classification '${attempt.classification}'`);
    }
    if (attempt.stackFailureEvidence !== false) {
      errors.push(`${id} cannot be treated as stack failure evidence`);
    }
    if (attempt.fallbackAuthorized !== false) {
      errors.push(`${id} cannot authorize fallback`);
    }
  }

  return errors;
}
