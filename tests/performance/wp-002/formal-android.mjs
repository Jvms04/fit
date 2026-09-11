#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, readFileSync, rmSync, statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

import { parseAmStartOutput, parseDeviceList, parseTotalPssKb } from "./lib/android-output.mjs";
import { evaluateLaunchAttempts, summarizeDurations } from "./lib/metrics.mjs";
import { portableInvocation } from "./lib/portable-command.mjs";
import { classifyNewProcessExits } from "./lib/process-exit.mjs";

const BUDGET_PATH = "docs/evidence/wp-002/SP007_S23_BUDGETS.json";
const SAMPLE_COUNT = 30;
const PACKAGE_NAME = "com.fit.wp002probe";
const ACTIVITY = `${PACKAGE_NAME}/.MainActivity`;
const EXPECTED_SCOPE = {
  device: "Samsung Galaxy S23 (SM-S911B)",
  os: "Android 16 / API 36",
  buildType: "release harness",
  dataset: "synthetic deterministic dataset with 1000 rows"
};

class ProtocolError extends Error {
  constructor(message, phase, command = null, exitCode = null) {
    super(message);
    this.phase = phase;
    this.command = command;
    this.exitCode = exitCode;
  }
}

function readArguments(argv) {
  const allowed = new Set(["adb", "serial", "repo-root", "preregistration-commit", "apk", "apk-metadata"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new ProtocolError(`invalid argument sequence near '${key ?? "end"}'`, "arguments");
    }
    const name = key.slice(2);
    if (!allowed.has(name)) {
      throw new ProtocolError(`unsupported argument '--${name}'`, "arguments");
    }
    if (values.has(name)) {
      throw new ProtocolError(`duplicate argument '--${name}'`, "arguments");
    }
    values.set(name, value);
  }
  return values;
}

function required(value, name) {
  if (!value) throw new ProtocolError(`${name} is required`, "arguments");
  return value;
}

function execute(file, args, options = {}) {
  const invocation = portableInvocation(file, args);
  const result = spawnSync(invocation.executable, invocation.args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options
  });
  if (result.error) {
    return { exitCode: null, stdout: "", stderr: result.error.message };
  }
  return { exitCode: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function runGit(repoRoot, args, phase) {
  const result = execute("git", ["-C", repoRoot, ...args]);
  if (result.exitCode !== 0) {
    throw new ProtocolError(
      `${phase} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      phase,
      ["git", ...args],
      result.exitCode
    );
  }
  return result.stdout.trim();
}

function loadPreregisteredBudget(repoRoot, preregistrationCommit) {
  const sourceHead = runGit(repoRoot, ["rev-parse", "HEAD"], "resolve-source-head");
  const preregistrationHead = runGit(
    repoRoot,
    ["rev-parse", "--verify", `${preregistrationCommit}^{commit}`],
    "resolve-preregistration-commit"
  );
  if (sourceHead === preregistrationHead) {
    throw new ProtocolError(
      "formal execution must use source committed after budget preregistration",
      "budget-chronology"
    );
  }
  const ancestry = execute("git", ["-C", repoRoot, "merge-base", "--is-ancestor", preregistrationHead, sourceHead]);
  if (ancestry.exitCode !== 0) {
    throw new ProtocolError("preregistration commit is not an ancestor of the source head", "budget-ancestry");
  }
  const budgetDiff = execute("git", [
    "-C", repoRoot, "diff", "--quiet", preregistrationHead, sourceHead, "--", BUDGET_PATH
  ]);
  if (budgetDiff.exitCode !== 0) {
    throw new ProtocolError("budget file changed after preregistration", "budget-integrity");
  }
  const raw = runGit(repoRoot, ["show", `${preregistrationHead}:${BUDGET_PATH}`], "read-preregistered-budget");
  const budget = JSON.parse(raw);
  const expectedScope = {
    ...EXPECTED_SCOPE, alphaWide: false, definesAndroidMinimumOrIntermediate: false, coversIos: false
  };
  if (
    budget.status !== "APPROVED-PREREGISTERED" ||
    budget.retrospectiveApplication !== false ||
    JSON.stringify(budget.scope) !== JSON.stringify(expectedScope) ||
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
    throw new ProtocolError("preregistered budget does not match the approved S23 formal protocol", "budget-contract");
  }
  return {
    budget,
    budgetSha256: sha256Bytes(`${raw}\n`),
    preregistrationHead,
    sourceHead
  };
}

function loadAndVerifyCiArtifact(metadataPath, apkPath, sourceHead) {
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch (error) {
    throw new ProtocolError(`cannot read CI APK metadata: ${error.message}`, "artifact-metadata");
  }
  const contractValid =
    metadata.schemaVersion === 1 &&
    metadata.evidenceType === "WP-002-ANDROID-APK-PROVENANCE" &&
    metadata.generatedBy === "github-actions" &&
    metadata.source?.repository === "Jvms04/fit" &&
    /^[0-9a-f]{40}$/u.test(metadata.source?.headSha ?? "") &&
    /^[0-9a-f]{40}$/u.test(metadata.source?.eventSha ?? "") &&
    /^\d+$/u.test(metadata.source?.runId ?? "") &&
    /^\d+$/u.test(metadata.source?.runAttempt ?? "") &&
    metadata.source?.workflow === "WP-002 G0 harness" &&
    metadata.source?.job === "android-probe-build" &&
    metadata.build?.variant === "release" &&
    metadata.build?.gradleTask === ":app:assembleRelease" &&
    metadata.build?.architecture === "arm64-v8a" &&
    metadata.build?.artifactName === "wp-002-android-probe" &&
    metadata.apk?.fileName === "app-release.apk" &&
    metadata.apk?.packageName === PACKAGE_NAME &&
    metadata.apk?.debuggable === false &&
    metadata.runtimeContract?.marker === "[FIT_WP002]" &&
    metadata.runtimeContract?.expectedSyntheticRowCount === 1000;
  if (!contractValid) {
    throw new ProtocolError("package or build contract in CI metadata is invalid", "artifact-metadata-contract");
  }
  if (metadata.source.headSha !== sourceHead) {
    throw new ProtocolError("checkout head does not match the CI artifact source head", "artifact-source-head");
  }
  let localSha256;
  let localSizeBytes;
  try {
    localSha256 = sha256File(apkPath);
    localSizeBytes = statSync(apkPath).size;
  } catch (error) {
    throw new ProtocolError(`cannot read authorized local APK: ${error.message}`, "artifact-local-apk");
  }
  if (basename(apkPath) !== metadata.apk.fileName ||
      localSha256 !== metadata.apk.sha256 || localSizeBytes !== metadata.apk.sizeBytes) {
    throw new ProtocolError("local APK does not match CI metadata", "artifact-local-apk");
  }
  return {
    metadata,
    metadataSha256: sha256File(metadataPath),
    localSha256,
    localSizeBytes,
    checkoutHeadMatchesCi: true,
    localApkMatchesCi: true,
    installedApkMatchesCi: false,
    packageMatches: true,
    fullyVerified: false
  };
}

function summarizePss(records) {
  const measured = records.filter((record) => record.protocolClassification === "MEASURED");
  const values = measured.map((record) => record.totalPssKb);
  if (measured.length !== SAMPLE_COUNT || values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }
  const summary = summarizeDurations(values);
  return {
    count: summary.count, minKb: summary.minMs, medianKb: summary.medianMs,
    p95Kb: summary.p95Ms, maxKb: summary.maxMs
  };
}

function runtimeMarker(logcatRaw) {
  const markerLines = String(logcatRaw).split(/\r?\n/u).filter((line) => line.includes("[FIT_WP002]"));
  for (const line of markerLines.reverse()) {
    const jsonStart = line.indexOf("{", line.indexOf("[FIT_WP002]"));
    if (jsonStart === -1) continue;
    try {
      const value = JSON.parse(line.slice(jsonStart));
      if (value.status === "ready" && value.rowCount === 1000 &&
          typeof value.sqliteVersion === "string" && typeof value.cipherVersion === "string") {
        return value;
      }
    } catch {
      // Preserve raw output and continue searching for a valid marker.
    }
  }
  return null;
}

function waitMilliseconds(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function createState() {
  return {
    phase: "initialization",
    cold: [], warm: [], commandLog: [],
    preregistration: null,
    artifactVerification: null,
    environment: null,
    runtimeVerification: null,
    crashEvidence: { beforeRaw: "", afterRaw: "", abnormalRecords: [], expectedProtocolRecords: [] },
    acquisitionStarted: false,
    interruption: null
  };
}

function buildReport(state) {
  const coldLaunchEvaluation = evaluateLaunchAttempts(state.cold, "COLD");
  const coldEvaluation = {
    ...coldLaunchEvaluation,
    records: coldLaunchEvaluation.records.map((record) => ({
      ...record,
      pssClassification: Number.isFinite(record.totalPssKb) && record.totalPssKb >= 0
        ? "MEASURED" : "MISSING_OR_INVALID_TOTAL_PSS"
    }))
  };
  const warmEvaluation = evaluateLaunchAttempts(state.warm, "WARM");
  const coldTotalPss = summarizePss(coldEvaluation.records);
  const complete = state.cold.length === SAMPLE_COUNT && state.warm.length === SAMPLE_COUNT;
  const coldSamplesValid = complete && coldEvaluation.measuredCount === SAMPLE_COUNT && coldTotalPss !== null;
  const warmSamplesValid = complete && warmEvaluation.measuredCount === SAMPLE_COUNT;
  const measurementSetValid = coldSamplesValid && warmSamplesValid;
  const observedCrashes = state.crashEvidence.abnormalRecords.length;
  const thresholds = state.preregistration?.budget?.budgets ?? null;
  const runnerCriteriaMet = Boolean(
    measurementSetValid && thresholds && observedCrashes === 0 &&
    coldEvaluation.totalTime.p95Ms <= thresholds.coldStartupTotalTimeP95Ms &&
    warmEvaluation.totalTime.p95Ms <= thresholds.warmStartupTotalTimeP95Ms &&
    coldTotalPss.p95Kb <= thresholds.coldTotalPssP95Kb
  );
  const fullyBound = state.artifactVerification?.fullyVerified === true &&
    state.runtimeVerification?.verified === true;

  return {
    schemaVersion: 2,
    protocol: "SP-007 / VAL-001 Samsung Galaxy S23 line",
    stage: "FORMAL-30",
    runClassification: !state.interruption && fullyBound && measurementSetValid
      ? "FORMAL_RUN_EVIDENCE_CANDIDATE" : "ABORTED_DIAGNOSTIC",
    canonicalProtocolStatus: "REQUIRES-HUMAN-REVIEW",
    formalValidation: false,
    automaticPromotion: false,
    generatedAt: new Date().toISOString(),
    completed: { cold: state.cold.length, warm: state.warm.length },
    interruption: state.interruption,
    prerequisites: state.preregistration ? {
      preregistrationCommit: state.preregistration.preregistrationHead,
      sourceHead: state.preregistration.sourceHead,
      sourceIsAfterPreregistration: true,
      budgetFile: BUDGET_PATH,
      budgetFileSha256: state.preregistration.budgetSha256,
      budgetFileUnchangedSincePreregistration: true
    } : null,
    artifactVerification: state.artifactVerification ? {
      metadataSha256: state.artifactVerification.metadataSha256,
      ci: state.artifactVerification.metadata.source,
      apk: state.artifactVerification.metadata.apk,
      checkoutHeadMatchesCi: state.artifactVerification.checkoutHeadMatchesCi,
      localApkMatchesCi: state.artifactVerification.localApkMatchesCi,
      installedApkMatchesCi: state.artifactVerification.installedApkMatchesCi,
      installedApkSha256: state.artifactVerification.installedSha256 ?? null,
      installedApkSizeBytes: state.artifactVerification.installedSizeBytes ?? null,
      packageMatches: state.artifactVerification.packageMatches,
      fullyVerified: state.artifactVerification.fullyVerified
    } : null,
    environment: state.environment,
    runtimeVerification: state.runtimeVerification,
    subject: {
      packageName: PACKAGE_NAME,
      activity: ACTIVITY,
      samplesPerLaunchMode: SAMPLE_COUNT,
      buildType: state.artifactVerification?.fullyVerified ? "VERIFIED_RELEASE_HARNESS" : "UNVERIFIED",
      dataset: state.runtimeVerification?.verified ? "VERIFIED_SYNTHETIC_1000_ROWS" : "UNVERIFIED"
    },
    budgets: state.preregistration ? {
      status: state.preregistration.budget.status,
      scope: state.preregistration.budget.scope,
      thresholds
    } : null,
    raw: {
      cold: coldEvaluation.records,
      warm: warmEvaluation.records,
      commands: state.commandLog
    },
    crashEvidence: state.crashEvidence,
    summaries: {
      coldTotalTime: coldEvaluation.totalTime,
      warmTotalTime: warmEvaluation.totalTime,
      coldTotalPss
    },
    criteria: {
      p95Method: "nearest-rank", p95Rank: 29,
      coldSamplesValid, warmSamplesValid,
      observedCrashes, observedAbnormalProcessExits: observedCrashes,
      allowedCrashes: state.preregistration?.budget?.sampleValidity?.allowedCrashes ?? 0,
      coldStartupP95WithinBudget: Boolean(coldSamplesValid &&
        coldEvaluation.totalTime.p95Ms <= thresholds.coldStartupTotalTimeP95Ms),
      warmStartupP95WithinBudget: Boolean(warmSamplesValid &&
        warmEvaluation.totalTime.p95Ms <= thresholds.warmStartupTotalTimeP95Ms),
      coldTotalPssP95WithinBudget: Boolean(coldTotalPss &&
        coldTotalPss.p95Kb <= thresholds.coldTotalPssP95Kb),
      runnerCriteriaMet
    },
    preservedStatuses: {
      sp007: "IN-PROGRESS", val001: "NOT-EXECUTED", val003: "NOT-EXECUTED",
      val004: "NOT-EXECUTED", val006: "NOT-EXECUTED", val025: "NOT-EXECUTED",
      ios: "BLOCKED", queryBudget: "NOT-PROPOSED", scrollBudget: "NOT-PROPOSED",
      killRestartBudget: "NOT-PROPOSED", specificHeapBudget: "NOT-PROPOSED",
      wp003: "NOT-STARTED", fallback: "NOT-ACTIVATED"
    },
    limitations: [
      "single Samsung Galaxy S23 / Android 16 physical device row",
      "not an Alpha-wide budget or support-matrix conclusion",
      "iOS physical execution remains blocked",
      "runner output requires independent human review and does not promote SP-007 or VAL-001"
    ]
  };
}

function run() {
  const state = createState();
  let installedCopyDirectory = null;
  let serial = null;
  let adb = null;

  const sanitize = (value) => serial ? String(value).split(serial).join("<redacted-serial>") : String(value);
  const adbExecute = (commandArgs, selected = true) => execute(adb, selected ? ["-s", serial, ...commandArgs] : commandArgs);
  const runAdb = (phase, commandArgs) => {
    state.phase = phase;
    const result = adbExecute(commandArgs);
    state.commandLog.push({
      phase, arguments: commandArgs, exitCode: result.exitCode,
      stdout: sanitize(result.stdout), stderr: sanitize(result.stderr)
    });
    if (result.exitCode !== 0) {
      throw new ProtocolError(
        `adb command failed (exit ${result.exitCode}): ${sanitize(result.stderr).trim()}`,
        phase, ["adb", ...commandArgs], result.exitCode
      );
    }
    return result.stdout;
  };
  const captureExitInfo = (phase, bestEffort = false) => {
    const result = adbExecute(["shell", "dumpsys", "activity", "exit-info", PACKAGE_NAME]);
    state.commandLog.push({
      phase, arguments: ["shell", "dumpsys", "activity", "exit-info", PACKAGE_NAME],
      exitCode: result.exitCode, stdout: sanitize(result.stdout), stderr: sanitize(result.stderr)
    });
    if (result.exitCode !== 0 && !bestEffort) {
      throw new ProtocolError("package-scoped process exit evidence unavailable", phase, ["adb", "dumpsys", "activity", "exit-info"], result.exitCode);
    }
    return result.exitCode === 0 ? result.stdout : "";
  };

  try {
    const args = readArguments(process.argv.slice(2));
    adb = args.get("adb") ?? process.env.ADB_BIN ?? "adb";
    serial = required(args.get("serial"), "--serial");
    const repoRoot = resolve(args.get("repo-root") ?? process.cwd());
    const preregistrationCommit = required(args.get("preregistration-commit"), "--preregistration-commit");
    const apkPath = resolve(required(args.get("apk"), "--apk"));
    const metadataPath = resolve(required(args.get("apk-metadata"), "--apk-metadata"));

    state.phase = "budget-preregistration";
    state.preregistration = loadPreregisteredBudget(repoRoot, preregistrationCommit);
    state.phase = "artifact-ci-metadata";
    state.artifactVerification = loadAndVerifyCiArtifact(
      metadataPath, apkPath, state.preregistration.sourceHead
    );

    state.phase = "device-selection";
    const devicesResult = adbExecute(["devices", "-l"], false);
    if (devicesResult.exitCode !== 0) {
      throw new ProtocolError("list Android devices failed", "device-selection", ["adb", "devices", "-l"], devicesResult.exitCode);
    }
    const selected = parseDeviceList(devicesResult.stdout).find((device) => device.serial === serial);
    if (!selected || selected.state !== "device") {
      throw new ProtocolError(
        `selected Android device is not authorized and online (state: ${selected?.state ?? "absent"})`,
        "device-selection"
      );
    }
    const selectedDevice = {
      state: selected.state, product: selected.product ?? null, model: selected.model ?? null,
      device: selected.device ?? null, transportId: selected.transportId ?? null
    };
    const getProp = (name) => runAdb(`device-property-${name}`, ["shell", "getprop", name]).trim();
    state.environment = {
      serialRef: `sha256:${sha256Bytes(serial).slice(0, 12)}`,
      selectedDevice,
      manufacturer: getProp("ro.product.manufacturer"),
      model: getProp("ro.product.model"),
      device: getProp("ro.product.device"),
      androidRelease: getProp("ro.build.version.release"),
      apiLevel: getProp("ro.build.version.sdk"),
      buildFingerprint: getProp("ro.build.fingerprint"),
      wmSize: runAdb("device-wm-size", ["shell", "wm", "size"]).trim(),
      wmDensity: runAdb("device-wm-density", ["shell", "wm", "density"]).trim()
    };
    const adbVersion = adbExecute(["version"], false);
    if (adbVersion.exitCode !== 0) {
      throw new ProtocolError("read adb version failed", "adb-version", ["adb", "version"], adbVersion.exitCode);
    }
    state.environment.adb = sanitize(adbVersion.stdout.trim());
    if (state.environment.model !== "SM-S911B" || state.environment.androidRelease !== "16" || state.environment.apiLevel !== "36") {
      throw new ProtocolError(
        `formal protocol is scoped only to SM-S911B / Android 16 / API 36; observed ${state.environment.model} / ${state.environment.androidRelease} / ${state.environment.apiLevel}`,
        "device-scope"
      );
    }

    const packagePaths = runAdb("installed-package-path", ["shell", "pm", "path", PACKAGE_NAME])
      .split(/\r?\n/u).filter(Boolean).map((line) => line.startsWith("package:") ? line.slice(8) : null);
    if (packagePaths.length !== 1 || !packagePaths[0]?.endsWith("base.apk")) {
      throw new ProtocolError("installed package does not expose one verifiable base APK", "installed-package-path");
    }
    installedCopyDirectory = mkdtempSync(join(tmpdir(), "fit-wp002-installed-apk-"));
    const installedApkPath = join(installedCopyDirectory, "installed-base.apk");
    runAdb("installed-apk-pull", ["pull", packagePaths[0], installedApkPath]);
    const installedSha256 = sha256File(installedApkPath);
    const installedSizeBytes = statSync(installedApkPath).size;
    if (installedSha256 !== state.artifactVerification.localSha256 ||
        installedSizeBytes !== state.artifactVerification.localSizeBytes) {
      throw new ProtocolError("installed APK does not match the authorized APK", "installed-apk-integrity");
    }
    state.artifactVerification.installedApkMatchesCi = true;
    state.artifactVerification.installedSha256 = installedSha256;
    state.artifactVerification.installedSizeBytes = installedSizeBytes;
    state.artifactVerification.fullyVerified = true;

    runAdb("runtime-preflight-logcat-clear", ["logcat", "-c"]);
    runAdb("runtime-preflight-force-stop", ["shell", "am", "force-stop", PACKAGE_NAME]);
    runAdb("runtime-preflight-launch", [
      "shell", "am", "start", "-W", "-n", ACTIVITY,
      "--es", "fit_wp002_probe_phase", "provenance-preflight"
    ]);
    const pid = runAdb("runtime-preflight-pid", ["shell", "pidof", PACKAGE_NAME]).trim();
    if (!/^\d+(?:\s+\d+)*$/u.test(pid)) {
      throw new ProtocolError("installed probe process is not running after preflight launch", "runtime-preflight-pid");
    }
    let runtimeRaw = "";
    let marker = null;
    for (let attempt = 1; attempt <= 20 && !marker; attempt += 1) {
      const attemptRaw = runAdb(
        `runtime-preflight-marker-${attempt}`,
        ["logcat", "-d", "-v", "epoch", "--pid", pid]
      );
      runtimeRaw += `--- attempt ${attempt} ---\n${attemptRaw}`;
      marker = runtimeMarker(attemptRaw);
      if (!marker && attempt < 20) waitMilliseconds(500);
    }
    if (!marker) {
      throw new ProtocolError("installed probe did not verify the synthetic 1000-row runtime contract", "runtime-preflight-marker");
    }
    state.runtimeVerification = {
      verified: true, source: "package-process-scoped-logcat", processId: Number(pid.split(/\s+/u)[0]),
      status: marker.status, sqliteVersion: marker.sqliteVersion, cipherVersion: marker.cipherVersion,
      syntheticRowCount: marker.rowCount, readyMsDiagnosticOnly: marker.readyMs ?? null, raw: runtimeRaw
    };

    runAdb("crash-baseline-force-stop", ["shell", "am", "force-stop", PACKAGE_NAME]);
    state.crashEvidence.beforeRaw = captureExitInfo("crash-baseline");
    state.acquisitionStarted = true;
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const sample = index + 1;
      runAdb(`cold-${sample}-force-stop`, ["shell", "am", "force-stop", PACKAGE_NAME]);
      const coldOutput = runAdb(`cold-${sample}-launch`, ["shell", "am", "start", "-W", "-n", ACTIVITY]);
      const memoryOutput = runAdb(`cold-${sample}-pss`, ["shell", "dumpsys", "meminfo", PACKAGE_NAME]);
      state.cold.push({
        sample, launch: parseAmStartOutput(coldOutput),
        totalPssKb: parseTotalPssKb(memoryOutput), memoryRaw: memoryOutput
      });
      runAdb(`warm-${sample}-background`, ["shell", "input", "keyevent", "KEYCODE_BACK"]);
      const warmOutput = runAdb(`warm-${sample}-launch`, ["shell", "am", "start", "-W", "-n", ACTIVITY]);
      state.warm.push({ sample, launch: parseAmStartOutput(warmOutput) });
    }
    state.crashEvidence.afterRaw = captureExitInfo("crash-final");
    const processExits = classifyNewProcessExits(
      state.crashEvidence.beforeRaw, state.crashEvidence.afterRaw, PACKAGE_NAME
    );
    state.crashEvidence = {
      beforeRaw: state.crashEvidence.beforeRaw,
      afterRaw: state.crashEvidence.afterRaw,
      expectedProtocolRecords: processExits.expectedProtocolRecords,
      abnormalRecords: processExits.abnormalRecords
    };
    const report = buildReport(state);
    return { report, exitCode: report.criteria.runnerCriteriaMet ? 0 : 2 };
  } catch (error) {
    const failure = error instanceof ProtocolError
      ? error
      : new ProtocolError(error.message, state.phase);
    if (adb && serial && state.acquisitionStarted) {
      state.crashEvidence.afterRaw = captureExitInfo("crash-after-interruption", true);
      const processExits = classifyNewProcessExits(
        state.crashEvidence.beforeRaw, state.crashEvidence.afterRaw, PACKAGE_NAME
      );
      state.crashEvidence.expectedProtocolRecords = processExits.expectedProtocolRecords;
      state.crashEvidence.abnormalRecords = processExits.abnormalRecords;
    }
    state.interruption = {
      phase: failure.phase,
      command: failure.command,
      exitCode: failure.exitCode,
      reason: sanitize(failure.message)
    };
    return { report: buildReport(state), exitCode: failure.phase === "arguments" ? 1 : 2, error: failure };
  } finally {
    if (installedCopyDirectory) rmSync(installedCopyDirectory, { recursive: true, force: true });
  }
}

const outcome = run();
process.stdout.write(`${JSON.stringify(outcome.report, null, 2)}\n`);
if (outcome.error) process.stderr.write(`${outcome.error.message}\n`);
process.exitCode = outcome.exitCode;
