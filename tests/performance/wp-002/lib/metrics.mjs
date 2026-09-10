export function summarizeDurations(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.some((sample) => !Number.isFinite(sample) || sample < 0)
  ) {
    throw new TypeError("samples must be a non-empty list of finite non-negative numbers");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;

  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: median,
    p95Ms: sorted[p95Index],
    maxMs: sorted.at(-1)
  };
}

function classifyLaunchAttempt(launch, expectedLaunchState) {
  if (launch.launchState === "UNKNOWN (0)") {
    return "NOT_A_LAUNCH_EVENT";
  }
  if (launch.launchState !== expectedLaunchState) {
    return "UNEXPECTED_LAUNCH_STATE";
  }
  if (!Number.isFinite(launch.totalTimeMs) || launch.totalTimeMs < 0) {
    return "MISSING_OR_INVALID_TOTAL_TIME";
  }
  return "MEASURED";
}

export function evaluateLaunchAttempts(attempts, expectedLaunchState) {
  const records = attempts.map((attempt) => ({
    ...attempt,
    protocolClassification: classifyLaunchAttempt(attempt.launch, expectedLaunchState)
  }));
  const measuredDurations = records
    .filter((record) => record.protocolClassification === "MEASURED")
    .map((record) => record.launch.totalTimeMs);

  return {
    expectedLaunchState,
    requestedCount: records.length,
    measuredCount: measuredDurations.length,
    excludedCount: records.length - measuredDurations.length,
    totalTime: measuredDurations.length > 0 ? summarizeDurations(measuredDurations) : null,
    records
  };
}
