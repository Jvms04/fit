import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildNode24Report } from "../../temporal/wp-002/run-node-val006.mjs";
import { buildHermesAndroidReport } from "../../native/wp-002-mobile-harness/val006/hermes-protocol.mjs";

const runner = fileURLToPath(
  new URL("../../temporal/wp-002/capture-hermes-android.mjs", import.meta.url)
);
const fakeAdb = fileURLToPath(new URL("../../fixtures/wp-002/fake-adb.mjs", import.meta.url));
const corpusPath = fileURLToPath(
  new URL("../../temporal/wp-002/fixtures/node24-vectors.json", import.meta.url)
);
const ruleBasePath = fileURLToPath(
  new URL("../../../node_modules/moment-timezone/data/packed/latest.json", import.meta.url)
);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

async function createFixture({ installedMismatch = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "fit-val006-hermes-physical-"));
  git(directory, ["init", "-q", "-b", "wp-002"]);
  git(directory, ["config", "user.name", "WP-002 Test"]);
  git(directory, ["config", "user.email", "wp002-test@example.invalid"]);
  writeFileSync(join(directory, "marker.txt"), "Hermes physical gate\n");
  git(directory, ["add", "marker.txt"]);
  git(directory, ["commit", "-q", "-m", "Hermes gate"]);
  const head = git(directory, ["rev-parse", "HEAD"]);

  const artifact = join(directory, "artifact");
  mkdirSync(artifact);
  const apk = join(artifact, "app-release.apk");
  const installedApk = join(artifact, "installed-base.apk");
  writeFileSync(apk, "authorized-hermes-apk\n");
  writeFileSync(installedApk, installedMismatch ? "different-apk\n" : "authorized-hermes-apk\n");

  const apkMetadata = {
    schemaVersion: 1,
    evidenceType: "WP-002-ANDROID-APK-PROVENANCE",
    generatedBy: "github-actions",
    source: {
      repository: "Jvms04/fit",
      headSha: head,
      eventSha: head,
      workflow: "WP-002 G0 harness",
      runId: "34719988298",
      runAttempt: "1",
      job: "android-probe-build"
    },
    build: {
      variant: "release",
      gradleTask: ":app:assembleRelease",
      architecture: "arm64-v8a",
      artifactName: "wp-002-android-probe"
    },
    apk: {
      fileName: "app-release.apk",
      sha256: sha256(apk),
      sizeBytes: readFileSync(apk).length,
      packageName: "com.fit.wp002probe",
      versionCode: "1",
      versionName: "0.0.0",
      debuggable: false
    }
  };
  const apkMetadataPath = join(artifact, "APK_PROVENANCE.json");
  writeFileSync(apkMetadataPath, `${JSON.stringify(apkMetadata, null, 2)}\n`);
  const hermesMetadata = {
    schemaVersion: 1,
    evidenceType: "WP-002-VAL006-HERMES-ANDROID-PREPARATION",
    generatedBy: "github-actions",
    source: { headSha: head, apkProvenanceRunId: "34719988298" },
    apk: {
      fileName: "app-release.apk",
      sha256: apkMetadata.apk.sha256,
      sizeBytes: apkMetadata.apk.sizeBytes,
      packageName: "com.fit.wp002probe",
      variant: "release",
      architecture: "arm64-v8a"
    },
    engine: {
      configured: "hermes",
      androidBundleFormat: "HERMES_BYTECODE",
      bytecodeMagicHex: "c61fbc03c103191f",
      arm64RuntimeLibraryEntry: "lib/arm64-v8a/libhermesvm.so"
    },
    ruleBase: {
      tzdbVersion: "2026c",
      momentTimezoneVersion: "0.6.3",
      sha256: sha256(ruleBasePath),
      bytesVerifiedInApk: true
    },
    corpus: {
      schemaVersion: 1,
      vectorCount: 5,
      sha256: sha256(corpusPath),
      bytesVerifiedInApk: true
    }
  };
  const hermesMetadataPath = join(artifact, "HERMES_ANDROID_PROVENANCE.json");
  writeFileSync(hermesMetadataPath, `${JSON.stringify(hermesMetadata, null, 2)}\n`);

  const [corpusBytes, ruleBaseBytes, nodeReport] = await Promise.all([
    Promise.resolve(new Uint8Array(readFileSync(corpusPath))),
    Promise.resolve(new Uint8Array(readFileSync(ruleBasePath))),
    buildNode24Report("v24.19.0")
  ]);
  const runtimeReport = buildHermesAndroidReport({
    runtime: { engine: "Hermes", hermesInternalPresent: true, platform: "android" },
    corpusBytes,
    corpusSha256: hermesMetadata.corpus.sha256,
    ruleBaseBytes,
    ruleBaseSha256: hermesMetadata.ruleBase.sha256
  });
  const runtimeReportPath = join(artifact, "runtime.json");
  const nodeReportPath = join(artifact, "node.json");
  writeFileSync(runtimeReportPath, JSON.stringify(runtimeReport));
  writeFileSync(nodeReportPath, `${JSON.stringify(nodeReport, null, 2)}\n`);

  return {
    directory,
    statePath: join(directory, "adb-state.json"),
    apk,
    installedApk,
    apkMetadataPath,
    hermesMetadataPath,
    runtimeReportPath,
    nodeReportPath
  };
}

function execute(fixture) {
  return spawnSync(process.execPath, [
    runner,
    "--adb", fakeAdb,
    "--serial", "serial-raw-must-not-appear",
    "--repo-root", fixture.directory,
    "--apk", fixture.apk,
    "--apk-metadata", fixture.apkMetadataPath,
    "--hermes-metadata", fixture.hermesMetadataPath,
    "--node-report", fixture.nodeReportPath
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_ADB_STATE: fixture.statePath,
      FAKE_ADB_INSTALLED_APK: fixture.installedApk,
      FAKE_ADB_HERMES_REPORT: fixture.runtimeReportPath
    }
  });
}

test("Hermes Android gate binds head, CI artifact, installed APK, runtime and Node vectors", async () => {
  const fixture = await createFixture();
  try {
    const run = execute(fixture);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.doesNotMatch(run.stdout, /serial-raw-must-not-appear/);
    const report = JSON.parse(run.stdout);
    assert.equal(report.classification, "VAL006_HERMES_ANDROID_PHYSICAL_EVIDENCE_CANDIDATE");
    assert.equal(report.provenance.fullyVerified, true);
    assert.equal(report.runtime.engine, "Hermes");
    assert.equal(report.runtime.engineVerified, true);
    assert.equal(report.comparison.comparable, true);
    assert.equal(report.comparison.vectorsMatched, 5);
    assert.equal(report.canonicalPromotion, false);
    assert.equal(report.hermes.ios, "BLOCKED");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Hermes Android gate aborts before runtime when installed APK differs", async () => {
  const fixture = await createFixture({ installedMismatch: true });
  try {
    const run = execute(fixture);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /installed APK does not match/i);
    assert.equal(JSON.parse(run.stdout).classification, "VAL006_HERMES_ANDROID_DIAGNOSTIC_INVALID");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
