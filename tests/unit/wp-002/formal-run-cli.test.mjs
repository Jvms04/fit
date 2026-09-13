import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const formalScript = fileURLToPath(
  new URL("../../performance/wp-002/formal-android.mjs", import.meta.url)
);
const characterizationScript = fileURLToPath(
  new URL("../../performance/wp-002/characterize-android.mjs", import.meta.url)
);
const fakeAdb = fileURLToPath(
  new URL("../../fixtures/wp-002/fake-adb.mjs", import.meta.url)
);
const budgetRelativePath = "docs/evidence/wp-002/SP007_S23_BUDGETS.json";
const approvedBudget = join(repositoryRoot, budgetRelativePath);

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function createExecutionRepository({
  mutateBudget = false,
  sourceIsPreregistration = false,
  preregistrationIsUnrelated = false,
  metadataPackage = "com.fit.wp002probe",
  metadataHead = null,
  installedApkMismatch = false
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "fit-wp002-formal-repo-"));
  const budgetPath = join(directory, budgetRelativePath);
  mkdirSync(dirname(budgetPath), { recursive: true });
  copyFileSync(approvedBudget, budgetPath);
  git(directory, ["init", "-q", "-b", "main"]);
  git(directory, ["config", "user.name", "WP-002 Test"]);
  git(directory, ["config", "user.email", "wp002-test@example.invalid"]);
  git(directory, ["add", budgetRelativePath]);
  git(directory, ["commit", "-q", "-m", "preregister budgets"]);
  const preregistrationCommit = git(directory, ["rev-parse", "HEAD"]);

  if (sourceIsPreregistration) {
    // Intentionally leave HEAD at the preregistration commit.
  } else if (preregistrationIsUnrelated) {
    git(directory, ["checkout", "-q", "--orphan", "unrelated"]);
    writeFileSync(join(directory, "unrelated.txt"), "unrelated source\n");
    git(directory, ["add", "unrelated.txt"]);
    git(directory, ["commit", "-q", "-m", "unrelated formal source"]);
  } else if (mutateBudget) {
    const budget = JSON.parse(execFileSync(process.execPath, [
      "-e",
      `process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))))`,
      budgetPath
    ], { encoding: "utf8" }));
    budget.budgets.coldStartupTotalTimeP95Ms = 601;
    writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
    git(directory, ["add", budgetRelativePath]);
    git(directory, ["commit", "-q", "-m", "mutate budgets"]);
  } else {
    writeFileSync(join(directory, "formal-run-marker.txt"), "after preregistration\n");
    git(directory, ["add", "formal-run-marker.txt"]);
    git(directory, ["commit", "-q", "-m", "prepare formal run"]);
  }

  const sourceHead = git(directory, ["rev-parse", "HEAD"]);
  const artifactDirectory = join(directory, "ci-artifact");
  mkdirSync(artifactDirectory);
  const apkPath = join(artifactDirectory, "app-release.apk");
  const installedApkPath = join(artifactDirectory, "installed-base.apk");
  const metadataPath = join(artifactDirectory, "APK_PROVENANCE.json");
  writeFileSync(apkPath, "authorized-release-apk\n");
  writeFileSync(installedApkPath, installedApkMismatch ? "different-installed-apk\n" : "authorized-release-apk\n");
  const metadata = {
    schemaVersion: 1,
    evidenceType: "WP-002-ANDROID-APK-PROVENANCE",
    generatedBy: "github-actions",
    source: {
      repository: "Jvms04/fit",
      headSha: metadataHead ?? sourceHead,
      eventSha: sourceHead,
      workflow: "WP-002 G0 harness",
      runId: "34390000000",
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
      sha256: sha256(apkPath),
      sizeBytes: readFileSync(apkPath).length,
      packageName: metadataPackage,
      versionCode: "1",
      versionName: "0.0.0",
      debuggable: false
    },
    runtimeContract: {
      marker: "[FIT_WP002]",
      expectedSyntheticRowCount: 1000,
      verification: "required from the installed probe during formal-run preflight"
    }
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    directory,
    preregistrationCommit,
    sourceHead,
    statePath: join(directory, "fake-adb-state.json"),
    apkPath,
    installedApkPath,
    metadataPath
  };
}

function executeFormal(fixture, extraEnvironment = {}, extraArguments = []) {
  return spawnSync(process.execPath, [
    formalScript,
    "--adb", fixture.adbPath ?? fakeAdb,
    "--serial", "serial-raw-must-not-appear",
    "--repo-root", fixture.directory,
    "--preregistration-commit", fixture.preregistrationCommit,
    "--apk", fixture.apkPath,
    "--apk-metadata", fixture.metadataPath,
    ...extraArguments
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_ADB_STATE: fixture.statePath,
      FAKE_ADB_PSS_KB: "118000",
      FAKE_ADB_INSTALLED_APK: fixture.installedApkPath,
      ...extraEnvironment
    }
  });
}

test("keeps initial characterization gated while the distinct formal runner owns the 30-sample protocol", () => {
  const characterization = spawnSync(process.execPath, [
    characterizationScript,
    "--serial", "synthetic",
    "--samples", "30"
  ], { encoding: "utf8" });
  assert.notEqual(characterization.status, 0);
  assert.match(characterization.stderr, /formal 30-run validation is gated/);

  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture);
    assert.equal(formal.status, 0, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.stage, "FORMAL-30");
    assert.equal(report.subject.samplesPerLaunchMode, 30);
    assert.equal(report.automaticPromotion, false);
    assert.equal(report.canonicalProtocolStatus, "REQUIRES-HUMAN-REVIEW");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("reads preregistered budgets and preserves exactly 30 measured samples with nearest-rank p95", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture);
    assert.equal(formal.status, 0, formal.stderr);
    const report = JSON.parse(formal.stdout);

    assert.equal(report.prerequisites.preregistrationCommit, fixture.preregistrationCommit);
    assert.equal(report.prerequisites.sourceHead, fixture.sourceHead);
    assert.equal(report.prerequisites.sourceIsAfterPreregistration, true);
    assert.equal(report.prerequisites.budgetFileUnchangedSincePreregistration, true);
    assert.equal(
      report.prerequisites.budgetFileSha256,
      "ffc27cd2de0de43180f11d02fac07fbae2eb5ed3ec3180d1d873a933a90de0f6"
    );
    assert.deepEqual(report.budgets.thresholds, {
      coldStartupTotalTimeP95Ms: 600,
      warmStartupTotalTimeP95Ms: 200,
      coldTotalPssP95Kb: 133120
    });
    assert.equal(report.raw.cold.length, 30);
    assert.equal(report.raw.warm.length, 30);
    assert.deepEqual(report.raw.cold.map((sample) => sample.sample), Array.from({ length: 30 }, (_, index) => index + 1));
    assert.deepEqual(report.raw.warm.map((sample) => sample.sample), Array.from({ length: 30 }, (_, index) => index + 1));
    assert.ok(report.raw.cold.every((sample) => sample.protocolClassification === "MEASURED"));
    assert.ok(report.raw.warm.every((sample) => sample.protocolClassification === "MEASURED"));
    assert.ok(report.raw.cold.every((sample) => sample.launch.raw.endsWith("\n")));
    assert.ok(report.raw.cold.every((sample) => sample.memoryRaw.endsWith("\n")));
    assert.ok(report.raw.warm.every((sample) => sample.launch.raw.endsWith("\n")));
    assert.deepEqual(report.summaries.coldTotalTime, {
      count: 30,
      minMs: 201,
      medianMs: 215.5,
      p95Ms: 229,
      maxMs: 230
    });
    assert.deepEqual(report.summaries.warmTotalTime, {
      count: 30,
      minMs: 101,
      medianMs: 115.5,
      p95Ms: 129,
      maxMs: 130
    });
    assert.deepEqual(report.summaries.coldTotalPss, {
      count: 30,
      minKb: 118000,
      medianKb: 118000,
      p95Kb: 118000,
      maxKb: 118000
    });
    assert.equal(report.criteria.p95Method, "nearest-rank");
    assert.equal(report.criteria.p95Rank, 29);
    assert.equal(report.criteria.observedCrashes, 0);
    assert.equal(report.criteria.allowedCrashes, 0);
    assert.equal(report.criteria.runnerCriteriaMet, true);
    assert.equal(report.artifactVerification.checkoutHeadMatchesCi, true);
    assert.equal(report.artifactVerification.localApkMatchesCi, true);
    assert.equal(report.artifactVerification.installedApkMatchesCi, true);
    assert.equal(report.artifactVerification.installedApkSha256, report.artifactVerification.apk.sha256);
    assert.equal(report.artifactVerification.installedApkSizeBytes, report.artifactVerification.apk.sizeBytes);
    assert.equal(report.artifactVerification.packageMatches, true);
    assert.equal(report.runtimeVerification.syntheticRowCount, 1000);
    assert.equal(report.runtimeVerification.verified, true);
    assert.equal(report.warmPreflight.counted, false);
    assert.equal(report.warmPreflight.precondition.achieved, true);
    assert.equal(report.warmPreflight.protocolClassification, "MEASURED");
    assert.equal(report.raw.warmPreconditions.length, 30);
    assert.ok(report.raw.warmPreconditions.every((record) => record.achieved));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a budget file changed after its preregistration commit before contacting ADB", () => {
  const fixture = createExecutionRepository({ mutateBudget: true });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stderr, /budget file changed after preregistration/);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
    assert.deepEqual(report.completed, { cold: 0, warm: 0 });
    assert.equal(existsSync(fixture.statePath), false, "budget drift must abort before ADB contact");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects any sample-count override on the formal runner", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, {}, ["--samples", "5"]);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stderr, /unsupported argument '--samples'/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("preserves invalid warm samples as diagnostics without using WaitTime or promoting a result", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_FORCE_UNKNOWN: "1" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
    assert.equal(report.raw.warm.length, 30);
    assert.ok(report.raw.warm.every((sample) => sample.protocolClassification === "NOT_A_LAUNCH_EVENT"));
    assert.ok(report.raw.warm.every((sample) => sample.launch.totalTimeMs === null));
    assert.ok(report.raw.warm.every((sample) => Number.isFinite(sample.launch.waitTimeMs)));
    assert.equal(report.summaries.warmTotalTime, null);
    assert.equal(report.criteria.warmSamplesValid, false);
    assert.equal(report.criteria.runnerCriteriaMet, false);
    assert.equal(report.automaticPromotion, false);
    assert.equal(report.canonicalProtocolStatus, "REQUIRES-HUMAN-REVIEW");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("aborts before warm launch when KEYCODE_BACK leaves the probe top-resumed and Android would only redeliver the intent", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_WARM_ACTIVITY_STUCK: "1" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    const fixtureState = JSON.parse(readFileSync(fixture.statePath, "utf8"));

    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
    assert.deepEqual(report.completed, { cold: 0, warm: 0 });
    assert.equal(report.interruption.phase, "warm-preflight-precondition");
    assert.equal(report.warmPreflight.precondition.achieved, false);
    assert.equal(report.warmPreflight.precondition.processAlive, true);
    assert.ok(report.warmPreflight.precondition.polls.length > 0);
    assert.match(
      report.warmPreflight.precondition.polls[0].activityRaw,
      /topResumedActivity=.*com\.fit\.wp002probe\/\.MainActivity/
    );
    assert.equal(fixtureState.warmLaunchAttemptCount, 0);
    assert.ok(
      report.raw.commands.every((command) => command.phase !== "warm-preflight-launch"),
      "am start -W must not run when the warm precondition is false"
    );
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("preserves acquired cold and warm samples when a later warm precondition times out", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_WARM_ACTIVITY_STUCK_AFTER: "4" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);

    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
    assert.deepEqual(report.completed, { cold: 3, warm: 2 });
    assert.equal(report.raw.cold.length, 3);
    assert.equal(report.raw.warm.length, 2);
    assert.equal(report.raw.warmPreconditions.length, 3);
    assert.equal(report.raw.warmPreconditions[2].achieved, false);
    assert.equal(report.interruption.phase, "warm-3-precondition");
    assert.ok(report.raw.commands.every((command) => command.phase !== "warm-3-launch"));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("aborts warm preflight when KEYCODE_BACK kills the probe process", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_PROCESS_DIES_ON_BACK: "1" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);

    assert.deepEqual(report.completed, { cold: 0, warm: 0 });
    assert.equal(report.interruption.phase, "warm-preflight-precondition");
    assert.equal(report.warmPreflight.precondition.achieved, false);
    assert.equal(report.warmPreflight.precondition.processAlive, false);
    assert.ok(report.raw.commands.every((command) => command.phase !== "warm-preflight-launch"));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("keeps a valid over-budget measurement as reviewable failure evidence", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_PSS_KB: "140000" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.criteria.coldSamplesValid, true);
    assert.equal(report.criteria.warmSamplesValid, true);
    assert.equal(report.criteria.coldTotalPssP95WithinBudget, false);
    assert.equal(report.criteria.runnerCriteriaMet, false);
    assert.equal(report.runClassification, "FORMAL_RUN_EVIDENCE_CANDIDATE");
    assert.equal(report.canonicalProtocolStatus, "REQUIRES-HUMAN-REVIEW");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a source head equal to the preregistration commit before ADB", () => {
  const fixture = createExecutionRepository({ sourceIsPreregistration: true });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /source committed after budget preregistration/);
    assert.equal(existsSync(fixture.statePath), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a preregistration commit that is not an ancestor", () => {
  const fixture = createExecutionRepository({ preregistrationIsUnrelated: true });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /not an ancestor/);
    assert.equal(existsSync(fixture.statePath), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a local APK whose hash diverges from CI metadata", () => {
  const fixture = createExecutionRepository();
  try {
    writeFileSync(fixture.apkPath, "tampered-local-apk\n");
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /local APK.*CI metadata/i);
    assert.equal(JSON.parse(formal.stdout).completed.cold, 0);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects CI metadata issued for a different repository head", () => {
  const fixture = createExecutionRepository({ metadataHead: "a".repeat(40) });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /checkout head does not match the CI artifact source head/);
    assert.equal(existsSync(fixture.statePath), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects an installed APK whose bytes diverge from the authorized APK", () => {
  const fixture = createExecutionRepository({ installedApkMismatch: true });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /installed APK.*authorized APK/i);
    assert.equal(JSON.parse(formal.stdout).completed.cold, 0);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects package divergence in CI APK metadata", () => {
  const fixture = createExecutionRepository({ metadataPackage: "com.other.application" });
  try {
    const formal = executeFormal(fixture);
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /package.*CI metadata/i);
    assert.equal(existsSync(fixture.statePath), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects when the expected probe package is not installed", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_INSTALLED_PACKAGE: "com.other.application" });
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /installed-package-path/);
    assert.equal(JSON.parse(formal.stdout).completed.cold, 0);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a device or OS outside the preregistered S23 line", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_MODEL: "SM-S921B" });
    assert.notEqual(formal.status, 0);
    assert.match(formal.stdout, /scoped only to SM-S911B/);
    assert.equal(JSON.parse(formal.stdout).completed.cold, 0);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects an installed runtime that does not prove the 1000-row dataset", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_RUNTIME_ROW_COUNT: "999" });
    assert.notEqual(formal.status, 0);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.completed.cold, 0);
    assert.equal(report.runtimeVerification, null);
    assert.equal(report.subject.dataset, "UNVERIFIED");
    assert.match(report.interruption.reason, /1000-row runtime contract/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("fails zero-crash when ApplicationExitInfo attributes a Java crash to the probe", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_PROBE_EXIT_REASON: "4", FAKE_ADB_PROBE_EXIT_LABEL: "crash" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.criteria.observedCrashes, 1);
    assert.equal(report.criteria.runnerCriteriaMet, false);
    assert.equal(report.crashEvidence.abnormalRecords[0].category, "JAVA_CRASH");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("does not let another application's crash contaminate the probe result", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_OTHER_APP_CRASH: "1", FAKE_ADB_OTHER_APP_EXIT: "1" });
    assert.equal(formal.status, 0, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.criteria.observedCrashes, 0);
    assert.equal(report.criteria.runnerCriteriaMet, true);
    assert.ok(report.crashEvidence.afterRaw.includes("com.other.application"));
    assert.ok(report.crashEvidence.abnormalRecords.every((record) => record.process === "com.fit.wp002probe"));
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("retains a mid-run probe crash even after bounded ApplicationExitInfo history evicts it", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, {
      FAKE_ADB_MIDRUN_CRASH_AFTER_WARM: "5",
      FAKE_ADB_EXIT_HISTORY_LIMIT: "4"
    });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);

    assert.deepEqual(report.completed, { cold: 30, warm: 30 });
    assert.equal(report.criteria.observedCrashes, 1);
    assert.equal(report.crashEvidence.abnormalRecords.length, 1);
    assert.equal(report.crashEvidence.abnormalRecords[0].category, "JAVA_CRASH");
    assert.equal(report.crashEvidence.expectedProtocolRecords.length, 30);
    assert.equal(report.crashEvidence.observations.length, 31);
    assert.equal(
      new Set(report.crashEvidence.expectedProtocolRecords.map((record) => record.identity)).size,
      30,
      "incremental snapshots must not count the same protocol force-stop twice"
    );
    assert.ok(
      report.crashEvidence.observations.some((observation) =>
        observation.newRecordIds.includes(report.crashEvidence.abnormalRecords[0].identity)
      )
    );
    assert.ok(
      !report.crashEvidence.afterRaw.includes(report.crashEvidence.abnormalRecords[0].raw),
      "the final bounded history should have evicted the crash"
    );
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("preserves missing or invalid cold TOTAL PSS as an invalid diagnostic", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_PSS_KB: "not-a-number" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.raw.cold[0].totalPssKb, null);
    assert.equal(report.raw.cold[0].pssClassification, "MISSING_OR_INVALID_TOTAL_PSS");
    assert.equal(report.summaries.coldTotalPss, null);
    assert.equal(report.criteria.coldSamplesValid, false);
    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("emits partial diagnostic JSON when ADB fails after acquired samples", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_FAIL_AFTER_PAIRS: "2" });
    assert.notEqual(formal.status, 0);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.runClassification, "ABORTED_DIAGNOSTIC");
    assert.equal(report.formalValidation, false);
    assert.equal(report.automaticPromotion, false);
    assert.deepEqual(report.completed, { cold: 2, warm: 2 });
    assert.equal(report.raw.cold.length, 2);
    assert.equal(report.raw.warm.length, 2);
    assert.equal(report.raw.cold[0].totalPssKb, 118000);
    assert.match(report.interruption.phase, /cold-3-force-stop/);
    assert.match(report.interruption.reason, /synthetic transport failure/);
    assert.ok(report.crashEvidence.afterRaw !== undefined);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("never measures an empty TotalTime as zero", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture, { FAKE_ADB_EMPTY_TOTAL_TIME: "WARM" });
    assert.equal(formal.status, 2, formal.stderr);
    const report = JSON.parse(formal.stdout);
    assert.equal(report.raw.warm[0].launch.totalTimeMs, null);
    assert.equal(report.raw.warm[0].protocolClassification, "MISSING_OR_INVALID_TOTAL_TIME");
    assert.equal(report.summaries.warmTotalTime, null);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("redacts the selected and unrelated raw device serials from final evidence", () => {
  const fixture = createExecutionRepository();
  try {
    const formal = executeFormal(fixture);
    assert.equal(formal.status, 0, formal.stderr);
    assert.doesNotMatch(formal.stdout, /serial-raw-must-not-appear|other-secret-serial/);
    assert.match(formal.stdout, /serialRef/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("runs the non-executable fake ADB portably through Node", () => {
  const fixture = createExecutionRepository();
  const portableFake = join(fixture.directory, "portable-fake-adb.mjs");
  copyFileSync(fakeAdb, portableFake);
  chmodSync(portableFake, 0o644);
  fixture.adbPath = portableFake;
  try {
    const formal = executeFormal(fixture);
    assert.equal(formal.status, 0, formal.stderr);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
