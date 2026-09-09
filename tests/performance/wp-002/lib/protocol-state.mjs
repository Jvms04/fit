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

  return errors;
}
