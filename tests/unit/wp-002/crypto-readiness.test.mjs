import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../crypto/wp-002/inspect-readiness.mjs", import.meta.url)
);

test("VAL-003/004 static readiness proves locked mechanisms without promoting runtime evidence", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, "VAL003_VAL004_STATIC_READINESS_PARTIAL");
  assert.equal(report.val003.sqlCipherBuildConfigured, true);
  assert.equal(report.val003.runtimeProtocolExecuted, false);
  assert.equal(report.val004.secureStoreConfigured, true);
  assert.equal(report.val004.csprngConfigured, true);
  assert.equal(report.val004.mathRandomUsedForKeys, false);
  assert.equal(report.val004.androidBackupDisabled, true);
  assert.equal(report.val004.accountLifecycleExecuted, false);
  assert.equal(report.canonicalPromotion, false);
  assert.equal(report.fallbackActivated, false);
});

test("disposable mobile key source uses CSPRNG and does not use Math.random", async () => {
  const source = await readFile(
    new URL("../../native/wp-002-mobile-harness/App.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Crypto\.getRandomBytesAsync\(32\)/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});
