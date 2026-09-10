#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

import { parseAmStartOutput, parseDeviceList, parseTotalPssKb } from "./lib/android-output.mjs";
import { evaluateLaunchAttempts, summarizeDurations } from "./lib/metrics.mjs";

const BUDGET_PATH = "docs/evidence/wp-002/SP007_S23_BUDGETS.json";
const SAMPLE_COUNT = 30;
const EXPECTED_SCOPE = {
  device: "Samsung Galaxy S23 (SM-S911B)",
  os: "Android 16 / API 36",
  buildType: "release harness",
  dataset: "synthetic deterministic dataset with 1000 rows"
};

function readArguments(argv) {
  const allowed = new Set(["adb", "serial", "repo-root", "preregistration-commit", "package", "activity"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near '${key ?? "end"}'`);
    }
    const name = key.slice(2);
    if (!allowed.has(name)) {
      throw new Error(`unsupported argument '--${name}'`);
    }
    if (values.has(name)) {
      throw new Error(`duplicate argument '--${name}'`);
    }
    values.set(name, value);
  }
  return values;
}

function execute(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function requireSuccess(command, label) {
  if (command.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${command.exitCode}): ${command.stderr.trim()}`);
  }
  return command.stdout.trim();
}

function runGit(repoRoot, args, label) {
  return execute("git", ["-C", repoRoot, ...args]);
}

function loadPreregisteredBudget(repoRoot, preregistrationCommit) {
  const sourceHead = requireSuccess(
    runGit(repoRoot, ["rev-parse", "HEAD"]),
    "resolve source head"
  );
  const preregistrationHead = requireSuccess(
    runGit(repoRoot, ["rev-parse", "--verify", `${preregistrationCommit}^{commit}`]),
    "resolve preregistration commit"
  );
  if (sourceHead === preregistrationHead) {
    throw new Error("formal execution must use source committed after budget preregistration");
  }
  const ancestry = runGit(repoRoot, ["merge-base", "--is-ancestor", preregistrationHead, sourceHead]);
  if (ancestry.exitCode !== 0) {
    throw new Error("preregistration commit is not an ancestor of the source head");
  }
  const budgetDiff = runGit(repoRoot, ["diff", "--quiet", preregistrationHead, sourceHead, "--", BUDGET_PATH]);
  if (budgetDiff.exitCode !== 0) {
    throw new Error("budget file changed after preregistration");
  }
  const raw = requireSuccess(
    runGit(repoRoot, ["show", `${preregistrationHead}:${BUDGET_PATH}`]),
    "read preregistered budget"
  );
  const budget = JSON.parse(raw);

  if (
    budget.status !== "APPROVED-PREREGISTERED" ||
    budget.retrospectiveApplication !== false ||
    JSON.stringify(budget.scope) !== JSON.stringify({
      ...EXPECTED_SCOPE,
      alphaWide: false,
      definesAndroidMinimumOrIntermediate: false,
      coversIos: false
    }) ||
    budget.sampleValidity?.cold?.required !== SAMPLE_COUNT ||
    budget.sampleValidity?.cold?.launchState !== "COLD" ||
    budget.sampleValidity?.cold?.protocolClassification !== "MEASURED" ||
    budget.sampleValidity?.cold?.metricRequired !== "TotalTime" ||
    budget.sampleValidity?.warm?.required !== SAMPLE_COUNT ||
    budget.sampleValidity?.warm?.launchState !== "WARM" ||
    budget.sampleValidity?.warm?.protocolClassification !== "MEASURED" ||
    budget.sampleValidity?.warm?.metricRequired !== "TotalTime" ||
    budget.sampleValidity?.waitTimeSubstitutionAllowed !== false ||
    budget.sampleValidity?.readyMsSubstitutionAllowed !== false ||
    budget.sampleValidity?.allowedCrashes !== 0 ||
    budget.budgets?.coldStartupTotalTimeP95Ms !== 600 ||
    budget.budgets?.warmStartupTotalTimeP95Ms !== 200 ||
    budget.budgets?.coldTotalPssP95Kb !== 133120 ||
    budget.statisticalMethod?.p95 !== "nearest-rank" ||
    budget.statisticalMethod?.rankFor30Samples !== 29 ||
    budget.formalRun?.started !== false ||
    budget.formalRun?.result !== "NOT-EXECUTED"
  ) {
    throw new Error("preregistered budget does not match the approved S23 formal protocol");
  }

  return {
    budget,
    budgetSha256: createHash("sha256").update(`${raw}\n`).digest("hex"),
    preregistrationHead,
    sourceHead
  };
}

function pssSummary(records) {
  const values = records
    .filter((record) => record.protocolClassification === "MEASURED")
    .map((record) => record.totalPssKb);
  if (
    values.length !== SAMPLE_COUNT ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    return null;
  }
  const summary = summarizeDurations(values);
  return {
    count: summary.count,
    minKb: summary.minMs,
    medianKb: summary.medianMs,
    p95Kb: summary.p95Ms,
    maxKb: summary.maxMs
  };
}

function main() {
  const args = readArguments(process.argv.slice(2));
  const adb = args.get("adb") ?? process.env.ADB_BIN ?? "adb";
  const serial = args.get("serial");
  const repoRoot = resolve(args.get("repo-root") ?? process.cwd());
  const preregistrationCommit = args.get("preregistration-commit");
  const packageName = args.get("package") ?? "com.fit.wp002probe";
  const activity = args.get("activity") ?? `${packageName}/.MainActivity`;

  if (!serial) {
    throw new Error("--serial is required; never guess the target device");
  }
  if (!preregistrationCommit) {
    throw new Error("--preregistration-commit is required");
  }

  // Budget integrity and chronology are checked before the first ADB command.
  const preregistration = loadPreregisteredBudget(repoRoot, preregistrationCommit);
  const commandLog = [];
  function runAdb(commandArgs) {
    const result = execute(adb, ["-s", serial, ...commandArgs]);
    commandLog.push({ arguments: commandArgs, ...result });
    if (result.exitCode !== 0) {
      throw new Error(`adb command failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  const devicesCommand = execute(adb, ["devices", "-l"]);
  commandLog.push({ arguments: ["devices", "-l"], ...devicesCommand });
  const devicesOutput = requireSuccess(devicesCommand, "list Android devices");
  const selected = parseDeviceList(devicesOutput).find((device) => device.serial === serial);
  if (!selected || selected.state !== "device") {
    throw new Error(`selected Android device is not authorized and online (state: ${selected?.state ?? "absent"})`);
  }

  const getProp = (name) => runAdb(["shell", "getprop", name]).trim();
  const installed = runAdb(["shell", "pm", "path", packageName]).trim();
  if (!installed.startsWith("package:")) {
    throw new Error(`probe package '${packageName}' is not installed on the selected device`);
  }
  const environment = {
    manufacturer: getProp("ro.product.manufacturer"),
    model: getProp("ro.product.model"),
    device: getProp("ro.product.device"),
    androidRelease: getProp("ro.build.version.release"),
    apiLevel: getProp("ro.build.version.sdk"),
    buildFingerprint: getProp("ro.build.fingerprint"),
    wmSize: runAdb(["shell", "wm", "size"]).trim(),
    wmDensity: runAdb(["shell", "wm", "density"]).trim(),
    adb: requireSuccess(execute(adb, ["version"]), "read adb version")
  };
  if (environment.model !== "SM-S911B" || environment.androidRelease !== "16" || environment.apiLevel !== "36") {
    throw new Error(
      `formal protocol is scoped only to SM-S911B / Android 16 / API 36; observed ${environment.model} / ${environment.androidRelease} / ${environment.apiLevel}`
    );
  }

  runAdb(["logcat", "-c"]);
  const cold = [];
  const warm = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    runAdb(["shell", "am", "force-stop", packageName]);
    const coldOutput = runAdb(["shell", "am", "start", "-W", "-n", activity]);
    const memoryOutput = runAdb(["shell", "dumpsys", "meminfo", packageName]);
    cold.push({
      sample: index + 1,
      launch: parseAmStartOutput(coldOutput),
      totalPssKb: parseTotalPssKb(memoryOutput),
      memoryRaw: memoryOutput
    });

    runAdb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
    const warmOutput = runAdb(["shell", "am", "start", "-W", "-n", activity]);
    warm.push({ sample: index + 1, launch: parseAmStartOutput(warmOutput) });
  }

  const coldEvaluation = evaluateLaunchAttempts(cold, "COLD");
  const warmEvaluation = evaluateLaunchAttempts(warm, "WARM");
  const coldTotalPss = pssSummary(coldEvaluation.records);
  const crashLog = runAdb(["logcat", "-d", "-v", "epoch"]);
  const observedCrashes = (crashLog.match(/FATAL EXCEPTION/g) ?? []).length;
  const thresholds = preregistration.budget.budgets;
  const coldSamplesValid = coldEvaluation.measuredCount === SAMPLE_COUNT && coldTotalPss !== null;
  const warmSamplesValid = warmEvaluation.measuredCount === SAMPLE_COUNT;
  const measurementSetValid = coldSamplesValid && warmSamplesValid;
  const runnerCriteriaMet =
    measurementSetValid &&
    observedCrashes === preregistration.budget.sampleValidity.allowedCrashes &&
    coldEvaluation.totalTime.p95Ms <= thresholds.coldStartupTotalTimeP95Ms &&
    warmEvaluation.totalTime.p95Ms <= thresholds.warmStartupTotalTimeP95Ms &&
    coldTotalPss.p95Kb <= thresholds.coldTotalPssP95Kb;

  const report = {
    schemaVersion: 1,
    protocol: "SP-007 / VAL-001 Samsung Galaxy S23 line",
    stage: "FORMAL-30",
    runClassification: measurementSetValid ? "FORMAL_RUN_EVIDENCE_CANDIDATE" : "ABORTED_DIAGNOSTIC",
    canonicalProtocolStatus: "REQUIRES-HUMAN-REVIEW",
    automaticPromotion: false,
    generatedAt: new Date().toISOString(),
    prerequisites: {
      preregistrationCommit: preregistration.preregistrationHead,
      sourceHead: preregistration.sourceHead,
      sourceIsAfterPreregistration: true,
      budgetFile: BUDGET_PATH,
      budgetFileSha256: preregistration.budgetSha256,
      budgetFileUnchangedSincePreregistration: true
    },
    environment: {
      serialRef: `sha256:${createHash("sha256").update(serial).digest("hex").slice(0, 12)}`,
      ...environment
    },
    subject: {
      packageName,
      activity,
      samplesPerLaunchMode: SAMPLE_COUNT,
      buildType: "release harness",
      dataset: "synthetic deterministic dataset with 1000 rows"
    },
    budgets: {
      status: preregistration.budget.status,
      scope: preregistration.budget.scope,
      thresholds
    },
    raw: {
      cold: coldEvaluation.records,
      warm: warmEvaluation.records,
      crashLog,
      commands: commandLog
    },
    summaries: {
      coldTotalTime: coldEvaluation.totalTime,
      warmTotalTime: warmEvaluation.totalTime,
      coldTotalPss
    },
    criteria: {
      p95Method: "nearest-rank",
      p95Rank: 29,
      coldSamplesValid,
      warmSamplesValid,
      observedCrashes,
      allowedCrashes: preregistration.budget.sampleValidity.allowedCrashes,
      coldStartupP95WithinBudget: coldSamplesValid
        ? coldEvaluation.totalTime.p95Ms <= thresholds.coldStartupTotalTimeP95Ms
        : false,
      warmStartupP95WithinBudget: warmSamplesValid
        ? warmEvaluation.totalTime.p95Ms <= thresholds.warmStartupTotalTimeP95Ms
        : false,
      coldTotalPssP95WithinBudget: coldTotalPss
        ? coldTotalPss.p95Kb <= thresholds.coldTotalPssP95Kb
        : false,
      runnerCriteriaMet
    },
    preservedStatuses: {
      sp007: "IN-PROGRESS",
      val001: "NOT-EXECUTED",
      val003: "NOT-EXECUTED",
      val004: "NOT-EXECUTED",
      val006: "NOT-EXECUTED",
      val025: "NOT-EXECUTED",
      ios: "BLOCKED",
      queryBudget: "NOT-PROPOSED",
      scrollBudget: "NOT-PROPOSED",
      killRestartBudget: "NOT-PROPOSED",
      specificHeapBudget: "NOT-PROPOSED",
      wp003: "NOT-STARTED",
      fallback: "NOT-ACTIVATED"
    },
    limitations: [
      "single Samsung Galaxy S23 / Android 16 physical device row",
      "not an Alpha-wide budget or support-matrix conclusion",
      "iOS physical execution remains blocked",
      "runner output requires independent human review and does not promote SP-007 or VAL-001"
    ]
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!runnerCriteriaMet) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
