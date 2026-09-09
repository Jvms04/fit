import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDurations } from "../../performance/wp-002/lib/metrics.mjs";

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
