import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("../../performance/wp-002/characterize-android.mjs", import.meta.url)
);
const fakeAdb = fileURLToPath(
  new URL("../../fixtures/wp-002/fake-adb.mjs", import.meta.url)
);

test("refuses to turn the initial characterization into the formal 30-run protocol", () => {
  const result = spawnSync(process.execPath, [script, "--serial", "synthetic", "--samples", "30"], {
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /formal 30-run validation is gated/);
});

test("requires an explicit device selector", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--serial is required/);
});

test("prepares a true WARM relaunch and emits a complete characterization candidate", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "fit-wp002-adb-"));
  const statePath = join(temporaryDirectory, "state.json");

  try {
    const result = spawnSync(process.execPath, [
      script,
      "--adb", fakeAdb,
      "--serial", "synthetic",
      "--samples", "5"
    ], {
      encoding: "utf8",
      env: { ...process.env, FAKE_ADB_STATE: statePath }
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.protocolValidity.eligibleForSp007Characterization, true);
    assert.deepEqual(
      report.raw.warm.map((record) => record.launch.launchState),
      ["WARM", "WARM", "WARM", "WARM", "WARM"]
    );
    assert.deepEqual(
      report.raw.warm.map((record) => record.protocolClassification),
      ["MEASURED", "MEASURED", "MEASURED", "MEASURED", "MEASURED"]
    );
    assert.equal(report.summaries.warmTotalTime.count, 5);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("preserves UNKNOWN (0) raw output and exits diagnostic-only without fabricating timing", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "fit-wp002-adb-"));
  const statePath = join(temporaryDirectory, "state.json");

  try {
    const result = spawnSync(process.execPath, [
      script,
      "--adb", fakeAdb,
      "--serial", "synthetic",
      "--samples", "5"
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_ADB_STATE: statePath,
        FAKE_ADB_FORCE_UNKNOWN: "1"
      }
    });

    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.attemptClassification, "ABORTED_DIAGNOSTIC");
    assert.equal(report.protocolValidity.eligibleForSp007Characterization, false);
    assert.equal(report.summaries.warmTotalTime, null);
    assert.deepEqual(
      report.raw.warm.map(({ protocolClassification, launch }) => ({
        protocolClassification,
        totalTimeMs: launch.totalTimeMs,
        waitTimeMs: launch.waitTimeMs
      })),
      [102, 103, 104, 105, 106].map((waitTimeMs) => ({
        protocolClassification: "NOT_A_LAUNCH_EVENT",
        totalTimeMs: null,
        waitTimeMs
      }))
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
