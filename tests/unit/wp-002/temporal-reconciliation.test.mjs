import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const implementation = await import("../../temporal/wp-002/lib/protocol.mjs").catch(() => ({}));

test("detects rule-base skew instead of silently accepting a different hash", () => {
  assert.equal(typeof implementation.evaluateRuleBaseHandshake, "function");

  assert.deepEqual(
    implementation.evaluateRuleBaseHandshake({
      localRuleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:aaa",
      remoteRuleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:aaa"
    }),
    { classification: "MATCH", skewDetected: false }
  );
  assert.deepEqual(
    implementation.evaluateRuleBaseHandshake({
      localRuleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:aaa",
      remoteRuleBaseId: "iana-2026c+moment-timezone-0.6.3+sha256:bbb"
    }),
    { classification: "RULE_BASE_SKEW", skewDetected: true }
  );
});

test("a future synthetic rule revision changes only future unconsolidated material", () => {
  assert.equal(typeof implementation.simulateFutureRuleRevision, "function");

  const oldRuleBaseId = "iana-2026c+moment-timezone-0.6.3+sha256:old";
  const newRuleBaseId = "iana-synthetic-future+sha256:new";
  const records = [
    {
      recordRef: "consolidated-occurrence",
      nominalLocal: "2027-02-01T09:00:00",
      instant: "2027-02-01T14:00:00Z",
      offset: "-05:00",
      identity: "occurrence-stable-001",
      version: 7,
      ruleBaseId: oldRuleBaseId,
      consolidated: true
    },
    {
      recordRef: "future-unconsolidated",
      nominalLocal: "2027-02-01T09:00:00",
      instant: "2027-02-01T14:00:00Z",
      offset: "-05:00",
      identity: "future-material-001",
      version: 2,
      ruleBaseId: oldRuleBaseId,
      consolidated: false
    },
    {
      recordRef: "past-unconsolidated",
      nominalLocal: "2026-12-01T09:00:00",
      instant: "2026-12-01T14:00:00Z",
      offset: "-05:00",
      identity: "past-material-001",
      version: 3,
      ruleBaseId: oldRuleBaseId,
      consolidated: false
    }
  ];

  const result = implementation.simulateFutureRuleRevision({
    records,
    effectiveFromLocal: "2027-01-01T00:00:00",
    newRuleBaseId,
    revisedOffset: "-04:00"
  });

  assert.deepEqual(result.records[0], records[0]);
  assert.deepEqual(result.records[2], records[2]);
  assert.deepEqual(result.records[1], {
    ...records[1],
    instant: "2027-02-01T13:00:00Z",
    offset: "-04:00",
    ruleBaseId: newRuleBaseId,
    reexpanded: true
  });
  assert.deepEqual(result.changedRecordRefs, ["future-unconsolidated"]);
});

test("the synthetic future revision is a versioned asset verified by its byte hash", async () => {
  assert.equal(typeof implementation.loadSyntheticFutureRevision, "function");

  const revision = await implementation.loadSyntheticFutureRevision();
  const bytes = await readFile(revision.assetPath);
  const independentHash = createHash("sha256").update(bytes).digest("hex");

  assert.equal(revision.assetSha256, independentHash);
  assert.equal(revision.hashVerified, true);
  assert.equal(revision.ruleBaseId, `iana-synthetic-future+sha256:${independentHash}`);
  assert.equal(revision.effectiveFromLocal, "2027-01-01T00:00:00");
  assert.equal(revision.revisedOffset, "-04:00");
});
