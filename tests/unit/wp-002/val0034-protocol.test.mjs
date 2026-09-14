import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildVal0034Plan,
  classifyVal0034Report,
  redactDeviceOutput,
  validateVal0034Report
} from "../../native/wp-002-mobile-harness/val0034/protocol.mjs";

test("builds the disposable VAL-003/004 plan without claiming A/B isolation", () => {
  const plan = buildVal0034Plan({
    apkSha256: "a".repeat(64),
    sourceHead: "b".repeat(40)
  });

  assert.deepEqual(plan.protocols, ["VAL-003", "VAL-004"]);
  assert.deepEqual(plan.val003.operations, [
    "create-db-wal-shm-canaries",
    "extract-db-wal-shm",
    "wrong-key",
    "rekey",
    "rekey-interruption",
    "restart-recovery",
    "integrity-after-recovery"
  ]);
  assert.deepEqual(plan.val004.operations, [
    "securestore-keystore",
    "csprng",
    "restart-process",
    "screen-lock-sealed-state",
    "biometric-change"
  ]);
  assert.equal(plan.val004.accountIsolation, "NOT_EVALUATED_WITHOUT_AUTH_A_B");
  assert.equal(plan.canonicalPromotion, false);
});

test("rejects a report that omits required VAL-003 operations", () => {
  assert.throws(
    () => validateVal0034Report({
      schemaVersion: 1,
      protocol: "VAL003_004_ANDROID_DISPOSABLE",
      sourceHead: "b".repeat(40),
      apkSha256: "a".repeat(64),
      operations: []
    }),
    /required operation/i
  );
});

test("classifies physical evidence as partial and never promotes VAL-003/004", () => {
  const report = {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    sourceHead: "b".repeat(40),
    apkSha256: "a".repeat(64),
    operations: [
      ...buildVal0034Plan({ apkSha256: "a".repeat(64), sourceHead: "b".repeat(40) }).val003.operations,
      ...buildVal0034Plan({ apkSha256: "a".repeat(64), sourceHead: "b".repeat(40) }).val004.operations
    ],
    accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
    samples: [{ operation: "wrong-key", classification: "MEASURED" }],
    canonicalPromotion: false,
    fallbackActivated: false
  };

  assert.equal(classifyVal0034Report(report), "PARTIAL");
});

test("redacts raw ADB device output while preserving non-sensitive model fields", () => {
  const redacted = redactDeviceOutput([
    "List of devices attached",
    "serial-raw device product:dm3q model:SM-S911B device:dm3q transport_id:1",
    "other-secret device product:other model:OTHER device:other transport_id:2"
  ].join("\n"));

  assert.doesNotMatch(redacted, /serial-raw|other-secret/);
  assert.match(redacted, /model:SM-S911B/);
  assert.match(redacted, /serialRef:/);
});

test("keeps an operation diagnostic when extraction is unavailable", () => {
  const plan = buildVal0034Plan({ apkSha256: "a".repeat(64), sourceHead: "b".repeat(40) });
  const report = {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    sourceHead: plan.sourceHead,
    apkSha256: plan.apkSha256,
    operations: [...plan.val003.operations, ...plan.val004.operations],
    accountIsolation: plan.val004.accountIsolation,
    samples: [{ operation: "extract-db-wal-shm", classification: "INCONCLUSIVE" }],
    canonicalPromotion: false,
    fallbackActivated: false
  };

  assert.equal(classifyVal0034Report(report), "PARTIAL");
  assert.equal(report.samples[0].classification, "INCONCLUSIVE");
});

test("requires provenance fields before a physical report can be validated", () => {
  const plan = buildVal0034Plan({ apkSha256: "a".repeat(64), sourceHead: "b".repeat(40) });
  assert.throws(
    () => validateVal0034Report({
      schemaVersion: 1,
      protocol: "VAL003_004_ANDROID_DISPOSABLE",
      sourceHead: plan.sourceHead,
      apkSha256: plan.apkSha256,
      operations: [...plan.val003.operations, ...plan.val004.operations],
      accountIsolation: plan.val004.accountIsolation,
      samples: [{ operation: "wrong-key", classification: "MEASURED" }],
      canonicalPromotion: true,
      fallbackActivated: false
    }),
    /canonical promotion/i
  );
});

test("Windows entrypoint invokes Node explicitly and keeps the serial local", () => {
  const script = readFileSync(
    join(process.cwd(), "tests/native/wp-002-mobile-harness/val0034/run-val0034-s23.ps1"),
    "utf8"
  );
  assert.match(script, /& node \$runner/);
  assert.match(script, /FIT_S23_ADB_SERIAL/);
  assert.doesNotMatch(script, /Write-Output.*\$serial/);
  assert.match(script, /APK_PROVENANCE\.json/);
});
