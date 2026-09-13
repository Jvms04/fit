import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../temporal/wp-002/run-node-val006.mjs", import.meta.url));

test("Node 24 runner emits partial evidence without canonical promotion or fallback", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.runtime.family, "Node");
  assert.equal(report.runtime.major, 24);
  assert.equal(report.classification, "VAL006_NODE24_PARTIAL_EVIDENCE");
  assert.equal(report.vectorSummary.matched, report.vectorSummary.total);
  assert.equal(report.handshake.sameRevision.skewDetected, false);
  assert.equal(report.handshake.differentHash.skewDetected, true);
  assert.equal(report.futureRevisionAsset.hashVerified, true);
  assert.match(report.futureRevisionAsset.ruleBaseId, /^iana-synthetic-future\+sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.futureRevision.changedRecordRefs, ["future-unconsolidated"]);
  assert.equal(report.networkRequired, false);
  assert.equal(report.hermes.android, "NOT-EXECUTED");
  assert.equal(report.hermes.ios, "BLOCKED");
  assert.equal(report.canonicalPromotion, false);
  assert.equal(report.fallbackActivated, false);
});

test("runtime guard rejects a non-Node-24 version", async () => {
  const module = await import("../../temporal/wp-002/run-node-val006.mjs").catch(() => ({}));
  assert.equal(typeof module.assertNode24, "function");
  assert.throws(() => module.assertNode24("v23.11.0"), /requires Node 24/);
  assert.doesNotThrow(() => module.assertNode24("v24.19.0"));
});
