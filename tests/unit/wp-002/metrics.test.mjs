import assert from "node:assert/strict";
import test from "node:test";

import { parseAmStartOutput } from "../../performance/wp-002/lib/android-output.mjs";
import * as metrics from "../../performance/wp-002/lib/metrics.mjs";

const { summarizeDurations } = metrics;

test("summarizes unsorted raw samples with nearest-rank p95", () => {
  const raw = [40, 10, 50, 20, 30];

  assert.deepEqual(summarizeDurations(raw), {
    count: 5,
    minMs: 10,
    medianMs: 30,
    p95Ms: 50,
    maxMs: 50
  });
  assert.deepEqual(raw, [40, 10, 50, 20, 30]);
});

test("rejects empty, negative, and non-finite samples", () => {
  for (const raw of [[], [1, -1], [1, Number.NaN], [1, Number.POSITIVE_INFINITY]]) {
    assert.throws(() => summarizeDurations(raw), /finite non-negative/);
  }
});

test("classifies UNKNOWN (0) without TotalTime as diagnostic-only and never uses WaitTime", () => {
  assert.equal(
    typeof metrics.evaluateLaunchAttempts,
    "function",
    "the runner needs an explicit launch-attempt classifier"
  );

  const waitTimes = [23, 19, 19, 27, 18];
  const attempts = waitTimes.map((waitTimeMs, index) => ({
    sample: index + 1,
    launch: parseAmStartOutput([
      "Status: ok",
      "LaunchState: UNKNOWN (0)",
      "Activity: com.fit.wp002probe/.MainActivity",
      `WaitTime: ${waitTimeMs}`,
      "Complete"
    ].join("\n"))
  }));

  const result = metrics.evaluateLaunchAttempts(attempts, "WARM");

  assert.equal(result.expectedLaunchState, "WARM");
  assert.equal(result.requestedCount, 5);
  assert.equal(result.measuredCount, 0);
  assert.equal(result.excludedCount, 5);
  assert.equal(result.totalTime, null);
  assert.deepEqual(
    result.records.map(({ protocolClassification, launch }) => ({
      protocolClassification,
      totalTimeMs: launch.totalTimeMs,
      waitTimeMs: launch.waitTimeMs
    })),
    waitTimes.map((waitTimeMs) => ({
      protocolClassification: "NOT_A_LAUNCH_EVENT",
      totalTimeMs: null,
      waitTimeMs
    }))
  );
});

test("classifies an empty TotalTime field as invalid rather than MEASURED zero", () => {
  const launch = parseAmStartOutput([
    "Status: ok",
    "LaunchState: COLD",
    "Activity: com.fit.wp002probe/.MainActivity",
    "TotalTime:",
    "WaitTime: 23",
    "Complete"
  ].join("\n"));

  const result = metrics.evaluateLaunchAttempts([{ sample: 1, launch }], "COLD");

  assert.equal(launch.totalTimeMs, null);
  assert.equal(result.measuredCount, 0);
  assert.equal(result.records[0].protocolClassification, "MISSING_OR_INVALID_TOTAL_TIME");
});

test("classifies Android top-most intent redelivery as not a warm launch event", () => {
  const launch = parseAmStartOutput([
    "Status: ok",
    "LaunchState: UNKNOWN (0)",
    "Activity: com.fit.wp002probe/.MainActivity",
    "TotalTime: 0",
    "WaitTime: 18",
    "Warning: Activity not started, intent has been delivered to currently running top-most instance.",
    "Complete"
  ].join("\n"));

  const result = metrics.evaluateLaunchAttempts([{ sample: 1, launch }], "WARM");

  assert.equal(launch.launchState, "UNKNOWN (0)");
  assert.equal(launch.totalTimeMs, 0);
  assert.equal(result.measuredCount, 0);
  assert.equal(result.records[0].protocolClassification, "NOT_A_LAUNCH_EVENT");
  assert.equal(result.totalTime, null);
});
