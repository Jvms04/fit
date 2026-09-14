#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

import { portableInvocation } from "../../../performance/wp-002/lib/portable-command.mjs";
import { buildVal0034Plan, redactDeviceOutput } from "./protocol.mjs";

const PACKAGE_NAME = "com.fit.wp002probe";
const ACTIVITY = `${PACKAGE_NAME}/.MainActivity`;
const ALLOWED = new Set(["adb", "serial", "repo-root", "apk", "apk-metadata", "output"]);

class ProbeError extends Error {
  constructor(message, phase, command = null) {
    super(message);
    this.phase = phase;
    this.command = command;
  }
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || !ALLOWED.has(flag.slice(2))) {
      throw new ProbeError(`invalid argument near '${flag ?? "end"}'`, "arguments");
    }
    values.set(flag.slice(2), value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new ProbeError(`${name} is required`, "arguments");
  return value;
}

function execute(file, args) {
  const invocation = portableInvocation(file, args);
  const result = spawnSync(invocation.executable, invocation.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    exitCode: result.error ? null : result.status,
    stdout: result.error ? "" : result.stdout ?? "",
    stderr: result.error ? result.error.message : result.stderr ?? ""
  };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitHead(repoRoot) {
  const result = execute("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
  if (result.exitCode !== 0) throw new ProbeError(result.stderr.trim(), "checkout-head");
  return result.stdout.trim();
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ProbeError(`cannot read ${label}: ${error.message}`, "provenance");
  }
}

function verifyArtifact(repoRoot, apkPath, metadataPath) {
  const metadata = readJson(metadataPath, "APK_PROVENANCE.json");
  const sourceHead = gitHead(repoRoot);
  const apkSha256 = sha256File(apkPath);
  const apkSizeBytes = statSync(apkPath).size;
  const valid = metadata.schemaVersion === 1 &&
    metadata.evidenceType === "WP-002-ANDROID-APK-PROVENANCE" &&
    metadata.generatedBy === "github-actions" &&
    metadata.source?.repository === "Jvms04/fit" &&
    metadata.source?.headSha === sourceHead &&
    metadata.source?.job === "android-probe-build" &&
    metadata.build?.variant === "release" &&
    metadata.build?.architecture === "arm64-v8a" &&
    metadata.build?.artifactName === "wp-002-android-probe" &&
    metadata.apk?.fileName === basename(apkPath) &&
    metadata.apk?.packageName === PACKAGE_NAME &&
    metadata.apk?.debuggable === false &&
    metadata.apk?.sha256 === apkSha256 &&
    metadata.apk?.sizeBytes === apkSizeBytes;
  if (!valid) throw new ProbeError("APK, checkout head, or CI provenance does not match", "provenance");
  return {
    sourceHead,
    apkSha256,
    apkSizeBytes,
    metadataSha256: sha256File(metadataPath),
    ciRunId: metadata.source.runId,
    packageName: metadata.apk.packageName,
    architecture: metadata.build.architecture,
    variant: metadata.build.variant
  };
}

function markerJson(raw, marker) {
  const lines = String(raw).split(/\r?\n/u).filter((line) => line.includes(marker));
  for (const line of lines.reverse()) {
    const start = line.indexOf("{", line.indexOf(marker));
    if (start < 0) continue;
    try {
      return JSON.parse(line.slice(start));
    } catch {
      // Preserve the raw line while continuing to an earlier complete marker.
    }
  }
  return null;
}

function run() {
  const values = parseArgs(process.argv.slice(2));
  const adb = values.get("adb") ?? process.env.ADB_BIN ?? "adb";
  const serial = required(values, "serial");
  const repoRoot = resolve(required(values, "repo-root"));
  const apkPath = resolve(required(values, "apk"));
  const metadataPath = resolve(required(values, "apk-metadata"));
  const outputPath = resolve(required(values, "output"));
  const serialRef = `sha256:${createHash("sha256").update(serial, "utf8").digest("hex").slice(0, 16)}`;
  const sanitize = (value) => redactDeviceOutput(String(value)).split(serial).join("<redacted-serial>");
  const report = {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    classification: "DIAGNOSTIC_INVALID",
    provenance: null,
    environment: { serialRef },
    samples: [],
    raw: { appMarkers: [], adbDiagnostics: [] },
    accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
    canonicalPromotion: false,
    fallbackActivated: false,
    formalValidation: false,
    automaticPromotion: false
  };
  let tempDirectory = null;
  const adbCall = (args, phase, allowFailure = false) => {
    const result = execute(adb, ["-s", serial, ...args]);
    const sanitizedStdout = sanitize(result.stdout);
    const sanitizedStderr = sanitize(result.stderr);
    if (result.exitCode !== 0 && !allowFailure) {
      throw new ProbeError(`${phase} failed: ${sanitizedStderr.trim() || sanitizedStdout.trim()}`, phase, args);
    }
    report.raw.adbDiagnostics.push({ phase, exitCode: result.exitCode, stdout: sanitizedStdout, stderr: sanitizedStderr });
    return { ...result, stdout: sanitizedStdout, stderr: sanitizedStderr };
  };
  try {
    report.provenance = verifyArtifact(repoRoot, apkPath, metadataPath);
    const plan = buildVal0034Plan({ apkSha256: report.provenance.apkSha256, sourceHead: report.provenance.sourceHead });
    report.plan = plan;
    report.sourceHead = plan.sourceHead;
    report.apkSha256 = plan.apkSha256;
    report.operations = [...plan.val003.operations, ...plan.val004.operations];

    const devices = execute(adb, ["devices", "-l"]);
    if (devices.exitCode !== 0) throw new ProbeError("adb devices failed", "device-discovery");
    const sanitizedDevices = sanitize(devices.stdout);
    report.raw.adbDiagnostics.push({ phase: "device-discovery", exitCode: devices.exitCode, stdout: sanitizedDevices, stderr: sanitize(devices.stderr) });
    const selectedLine = sanitizedDevices.split(/\r?\n/u).find((line) => line.startsWith(`serialRef:${serialRef.slice(7)} device`));
    if (!selectedLine) throw new ProbeError("selected device is not online", "device-discovery");

    const model = adbCall(["shell", "getprop", "ro.product.model"], "device-model").stdout.trim();
    const release = adbCall(["shell", "getprop", "ro.build.version.release"], "device-release").stdout.trim();
    const apiLevel = adbCall(["shell", "getprop", "ro.build.version.sdk"], "device-api").stdout.trim();
    report.environment = { serialRef, model, androidRelease: release, apiLevel };
    if (model !== "SM-S911B" || release !== "16" || apiLevel !== "36") {
      throw new ProbeError("device is outside the authorized Galaxy S23 / Android 16 line", "device-contract");
    }

    adbCall(["install", "-r", "-d", apkPath], "install");
    const packagePathResult = adbCall(["shell", "pm", "path", PACKAGE_NAME], "package-path");
    const packagePath = packagePathResult.stdout.split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
    if (!packagePath) throw new ProbeError("package path is unavailable", "installed-apk");
    tempDirectory = mkdtempSync(join(tmpdir(), "fit-val0034-installed-"));
    const installedPath = join(tempDirectory, "base.apk");
    adbCall(["pull", packagePath, installedPath], "installed-apk");
    const installedSha256 = sha256File(installedPath);
    const installedSizeBytes = statSync(installedPath).size;
    report.provenance.installedApkSha256 = installedSha256;
    report.provenance.installedApkSizeBytes = installedSizeBytes;
    report.provenance.installedApkMatchesCi = installedSha256 === report.provenance.apkSha256 && installedSizeBytes === report.provenance.apkSizeBytes;
    if (!report.provenance.installedApkMatchesCi) throw new ProbeError("installed APK does not match CI APK", "installed-apk");

    adbCall(["shell", "logcat", "-c"], "logcat-clear");
    adbCall(["shell", "am", "force-stop", PACKAGE_NAME], "force-stop-before-run");
    adbCall(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "fit-wp002://val0034/run", ACTIVITY], "launch-run");
    adbCall(["shell", "sleep", "4"], "await-run");
    const logcat = adbCall(["shell", "logcat", "-d", "-v", "brief"], "collect-run-log").stdout;
    const valReport = markerJson(logcat, "[FIT_VAL0034]");
    report.raw.appMarkers.push(...logcat.split(/\r?\n/u).filter((line) => line.includes("[FIT_VAL0034]")));
    if (valReport?.samples) report.samples.push(...valReport.samples);

    // Controlled interruption is a separate, explicitly diagnostic operation.
    adbCall(["shell", "logcat", "-c"], "logcat-clear-rekey");
    adbCall(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "fit-wp002://val0034/rekey-interruption", ACTIVITY], "launch-rekey-interruption");
    let interruptionObserved = false;
    for (let poll = 0; poll < 20; poll += 1) {
      const probeLog = adbCall(["shell", "logcat", "-d", "-v", "brief"], "poll-rekey-interruption").stdout;
      if (probeLog.includes("[FIT_VAL0034_REKEY_STARTED]")) {
        interruptionObserved = true;
        report.raw.appMarkers.push(...probeLog.split(/\r?\n/u).filter((line) => line.includes("[FIT_VAL0034_REKEY_STARTED]")));
        break;
      }
      execute(adb, ["-s", serial, "shell", "sleep", "0.25"]);
    }
    if (interruptionObserved) {
      adbCall(["shell", "am", "force-stop", PACKAGE_NAME], "force-stop-during-rekey");
      report.samples.push({ operation: "rekey-interruption", classification: "INCONCLUSIVE", detail: { interruptionObserved: true, recoveryRequiresRestart: true } });
    } else {
      report.samples.push({ operation: "rekey-interruption", classification: "DIAGNOSTIC_INVALID", detail: { interruptionObserved: false } });
    }

    // Lock/unlock is deliberately recorded as a physical-state observation, never inferred.
    adbCall(["shell", "input", "keyevent", "KEYCODE_POWER"], "screen-lock");
    adbCall(["shell", "sleep", "1"], "await-screen-lock");
    const lockLog = adbCall(["shell", "logcat", "-d", "-v", "brief"], "collect-screen-lock-log").stdout;
    report.raw.appMarkers.push(...lockLog.split(/\r?\n/u).filter((line) => line.includes("[FIT_VAL0034_APPSTATE]")));
    report.samples.push({ operation: "screen-lock-sealed-state", classification: "INCONCLUSIVE", detail: { requiresManualUnlockVerification: true } });
    adbCall(["shell", "input", "keyevent", "KEYCODE_POWER"], "screen-unlock-request");

    report.classification = "PARTIAL";
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return 0;
  } catch (error) {
    const probeError = error instanceof ProbeError ? error : new ProbeError(error.message, "unexpected");
    report.classification = "DIAGNOSTIC_INVALID";
    report.error = { phase: probeError.phase, message: probeError.message, command: probeError.command };
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return 2;
  } finally {
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  }
}

process.exitCode = run();
