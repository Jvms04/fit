import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function createExecutionRepository({ mutateBudget = false } = {}) {
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

  if (mutateBudget) {
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

  return {
    directory,
    preregistrationCommit,
    sourceHead: git(directory, ["rev-parse", "HEAD"]),
    statePath: join(directory, "fake-adb-state.json")
  };
}

function executeFormal(fixture, extraEnvironment = {}, extraArguments = []) {
  return spawnSync(process.execPath, [
    formalScript,
    "--adb", fakeAdb,
    "--serial", "synthetic",
    "--repo-root", fixture.directory,
    "--preregistration-commit", fixture.preregistrationCommit,
    ...extraArguments
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_ADB_STATE: fixture.statePath,
      FAKE_ADB_PSS_KB: "118000",
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
    assert.equal(formal.stdout, "");
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
