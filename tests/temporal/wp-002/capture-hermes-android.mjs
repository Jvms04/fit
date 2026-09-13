#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

import { parseDeviceList } from "../../performance/wp-002/lib/android-output.mjs";
import { portableInvocation } from "../../performance/wp-002/lib/portable-command.mjs";

const PACKAGE_NAME = "com.fit.wp002probe";
const ACTIVITY = `${PACKAGE_NAME}/.MainActivity`;
const RULE_BASE_SHA256 = "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
const CORPUS_SHA256 = "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";
const NODE_REPORT_SHA256 = "571cc728af288dcc6e220f5f3ff793a70bdee799a7ed0972e9a31ce796dd4e86";

function argsMap(argv) {
  const allowed = new Set([
    "adb", "serial", "repo-root", "apk", "apk-metadata", "hermes-metadata", "node-report"
  ]);
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || !allowed.has(flag.slice(2))) {
      throw new Error(`invalid or unsupported argument '${flag ?? "end"}'`);
    }
    result.set(flag.slice(2), value);
  }
  return result;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function execute(file, args) {
  const invocation = portableInvocation(file, args);
  const run = spawnSync(invocation.executable, invocation.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    exitCode: run.error ? null : run.status,
    stdout: run.error ? "" : run.stdout ?? "",
    stderr: run.error ? run.error.message : run.stderr ?? ""
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error.message}`);
  }
}

function gitHead(repoRoot) {
  const run = execute("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
  if (run.exitCode !== 0) throw new Error(`cannot resolve repository head: ${run.stderr.trim()}`);
  return run.stdout.trim();
}

function parseHermesMarker(raw) {
  const lines = String(raw).split(/\r?\n/u).filter((line) =>
    line.includes("[FIT_WP002_VAL006_HERMES]")
  );
  for (const line of lines.reverse()) {
    const start = line.indexOf("{", line.indexOf("[FIT_WP002_VAL006_HERMES]"));
    if (start < 0) continue;
    try {
      return JSON.parse(line.slice(start));
    } catch {
      // Continue to an earlier complete marker while preserving all raw lines.
    }
  }
  return null;
}

function buildInitialReport() {
  return {
    schemaVersion: 1,
    wp: "WP-002",
    validation: "VAL-006",
    classification: "VAL006_HERMES_ANDROID_DIAGNOSTIC_INVALID",
    provenance: { fullyVerified: false },
    environment: null,
    runtime: null,
    comparison: null,
    raw: { runtimeLog: "" },
    interruption: null,
    formalValidation: false,
    canonicalPromotion: false,
    automaticPromotion: false,
    fallbackActivated: false,
    hermes: { android: "NOT-EXECUTED", ios: "BLOCKED" }
  };
}

function run() {
  const report = buildInitialReport();
  let tempDirectory = null;
  let serial = null;
  const sanitize = (value) => serial ? String(value).split(serial).join("<redacted-serial>") : String(value);

  try {
    const args = argsMap(process.argv.slice(2));
    const adb = args.get("adb") ?? process.env.ADB_BIN ?? "adb";
    serial = required(args.get("serial"), "--serial");
    const repoRoot = resolve(args.get("repo-root") ?? process.cwd());
    const apkPath = resolve(required(args.get("apk"), "--apk"));
    const apkMetadataPath = resolve(required(args.get("apk-metadata"), "--apk-metadata"));
    const hermesMetadataPath = resolve(required(args.get("hermes-metadata"), "--hermes-metadata"));
    const nodeReportPath = resolve(required(args.get("node-report"), "--node-report"));
    const sourceHead = gitHead(repoRoot);
    const apkMetadata = readJson(apkMetadataPath, "APK metadata");
    const hermesMetadata = readJson(hermesMetadataPath, "Hermes metadata");
    const nodeReport = readJson(nodeReportPath, "Node reference report");
    if (sha256(nodeReportPath) !== NODE_REPORT_SHA256) {
      throw new Error("Node reference report bytes do not match the human-accepted evidence hash");
    }

    const localApkSha256 = sha256(apkPath);
    const localApkSizeBytes = statSync(apkPath).size;
    const metadataValid =
      apkMetadata.schemaVersion === 1 &&
      apkMetadata.evidenceType === "WP-002-ANDROID-APK-PROVENANCE" &&
      apkMetadata.generatedBy === "github-actions" &&
      apkMetadata.source?.repository === "Jvms04/fit" &&
      apkMetadata.source?.headSha === sourceHead &&
      apkMetadata.source?.job === "android-probe-build" &&
      apkMetadata.build?.variant === "release" &&
      apkMetadata.build?.architecture === "arm64-v8a" &&
      apkMetadata.apk?.fileName === basename(apkPath) &&
      apkMetadata.apk?.packageName === PACKAGE_NAME &&
      apkMetadata.apk?.debuggable === false &&
      apkMetadata.apk?.sha256 === localApkSha256 &&
      apkMetadata.apk?.sizeBytes === localApkSizeBytes;
    if (!metadataValid) throw new Error("local APK or source head does not match CI APK metadata");

    const hermesMetadataValid =
      hermesMetadata.schemaVersion === 1 &&
      hermesMetadata.evidenceType === "WP-002-VAL006-HERMES-ANDROID-PREPARATION" &&
      hermesMetadata.generatedBy === "github-actions" &&
      hermesMetadata.source?.headSha === sourceHead &&
      hermesMetadata.source?.apkProvenanceRunId === apkMetadata.source.runId &&
      hermesMetadata.apk?.sha256 === localApkSha256 &&
      hermesMetadata.apk?.sizeBytes === localApkSizeBytes &&
      hermesMetadata.apk?.packageName === PACKAGE_NAME &&
      hermesMetadata.engine?.configured === "hermes" &&
      hermesMetadata.engine?.androidBundleFormat === "HERMES_BYTECODE" &&
      hermesMetadata.engine?.bytecodeMagicHex === "c61fbc03c103191f" &&
      hermesMetadata.ruleBase?.tzdbVersion === "2026c" &&
      hermesMetadata.ruleBase?.sha256 === RULE_BASE_SHA256 &&
      hermesMetadata.ruleBase?.bytesVerifiedInApk === true &&
      hermesMetadata.corpus?.vectorCount === 5 &&
      hermesMetadata.corpus?.sha256 === CORPUS_SHA256 &&
      hermesMetadata.corpus?.bytesVerifiedInApk === true;
    if (!hermesMetadataValid) throw new Error("Hermes CI metadata contract is invalid");
    if (
      nodeReport.ruleBase?.bundleSha256 !== RULE_BASE_SHA256 ||
      nodeReport.vectorSummary?.total !== 5 ||
      nodeReport.vectorSummary?.matched !== 5
    ) {
      throw new Error("accepted Node report is not the expected VAL-006 reference");
    }

    const adbCall = (command, selected = true) => {
      const run = execute(adb, selected ? ["-s", serial, ...command] : command);
      if (run.exitCode !== 0) {
        throw new Error(`adb ${command.join(" ")} failed: ${sanitize(run.stderr).trim()}`);
      }
      return run.stdout;
    };
    const devices = parseDeviceList(adbCall(["devices", "-l"], false));
    const selected = devices.find((device) => device.serial === serial);
    if (!selected || selected.state !== "device") throw new Error("selected S23 is not online");
    const getProp = (name) => adbCall(["shell", "getprop", name]).trim();
    report.environment = {
      serialRef: `sha256:${createHash("sha256").update(serial).digest("hex").slice(0, 12)}`,
      manufacturer: getProp("ro.product.manufacturer"),
      model: getProp("ro.product.model"),
      androidRelease: getProp("ro.build.version.release"),
      apiLevel: getProp("ro.build.version.sdk")
    };
    if (
      report.environment.model !== "SM-S911B" ||
      report.environment.androidRelease !== "16" ||
      report.environment.apiLevel !== "36"
    ) {
      throw new Error("device is outside the authorized S23 / Android 16 / API 36 line");
    }

    const packagePaths = adbCall(["shell", "pm", "path", PACKAGE_NAME])
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => line.startsWith("package:") ? line.slice(8) : null);
    if (packagePaths.length !== 1 || !packagePaths[0]?.endsWith("base.apk")) {
      throw new Error("installed package does not expose one base APK");
    }
    tempDirectory = mkdtempSync(join(tmpdir(), "fit-val006-hermes-installed-"));
    const installedApk = join(tempDirectory, "installed-base.apk");
    adbCall(["pull", packagePaths[0], installedApk]);
    const installedSha256 = sha256(installedApk);
    const installedSizeBytes = statSync(installedApk).size;
    if (installedSha256 !== localApkSha256 || installedSizeBytes !== localApkSizeBytes) {
      throw new Error("installed APK does not match the authorized CI APK");
    }
    report.provenance = {
      fullyVerified: true,
      sourceHead,
      ciRunId: apkMetadata.source.runId,
      apkSha256: localApkSha256,
      apkSizeBytes: localApkSizeBytes,
      apkMetadataSha256: sha256(apkMetadataPath),
      hermesMetadataSha256: sha256(hermesMetadataPath),
      checkoutMatchesCi: true,
      localApkMatchesCi: true,
      installedApkMatchesCi: true,
      packageMatches: true,
      embeddedRuleBaseVerified: true,
      embeddedCorpusVerified: true,
      nodeReferenceReportSha256: NODE_REPORT_SHA256
    };

    adbCall(["logcat", "-c"]);
    adbCall(["shell", "am", "force-stop", PACKAGE_NAME]);
    adbCall([
      "shell", "am", "start", "-W", "-n", ACTIVITY,
      "--es", "fit_wp002_probe_phase", "val006-hermes-runtime"
    ]);
    const pid = adbCall(["shell", "pidof", PACKAGE_NAME]).trim();
    if (!/^\d+(?:\s+\d+)*$/u.test(pid)) throw new Error("probe process is not running");
    let marker = null;
    for (let attempt = 1; attempt <= 20 && !marker; attempt += 1) {
      const raw = adbCall(["logcat", "-d", "-v", "epoch", "--pid", pid]);
      report.raw.runtimeLog += `--- poll ${attempt} ---\n${sanitize(raw)}`;
      marker = parseHermesMarker(raw);
      if (!marker && attempt < 20) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      }
    }
    if (!marker) throw new Error("Hermes runtime marker was not observed");
    const comparable =
      marker.classification === "VAL006_HERMES_ANDROID_RUNTIME_CANDIDATE" &&
      marker.runtime?.engine === "Hermes" &&
      marker.runtime?.engineVerified === true &&
      marker.runtime?.platform === "android" &&
      marker.ruleBase?.id === nodeReport.ruleBase.id &&
      marker.ruleBase?.bundleSha256 === RULE_BASE_SHA256 &&
      marker.corpus?.sha256 === CORPUS_SHA256 &&
      marker.vectorSummary?.total === 5 &&
      marker.vectorSummary?.matched === 5 &&
      marker.comparison?.comparable === true &&
      JSON.stringify(marker.vectors) === JSON.stringify(nodeReport.vectors);
    if (!comparable) throw new Error("Hermes runtime result diverges from the accepted Node vectors");

    report.classification = "VAL006_HERMES_ANDROID_PHYSICAL_EVIDENCE_CANDIDATE";
    report.runtime = marker.runtime;
    report.ruleBase = marker.ruleBase;
    report.corpus = marker.corpus;
    report.vectors = marker.vectors;
    report.comparison = {
      comparable: true,
      vectorsMatched: 5,
      reference: "VAL006_NODE24_PARTIAL.json",
      nodeRuleBaseId: nodeReport.ruleBase.id,
      hermesRuleBaseId: marker.ruleBase.id
    };
    report.hermes.android = "PHYSICAL-EVIDENCE-CANDIDATE";
    report.requiresHumanReview = true;
    return { report, exitCode: 0 };
  } catch (error) {
    report.interruption = { reason: sanitize(error.message) };
    return { report, exitCode: 2, error };
  } finally {
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const outcome = run();
process.stdout.write(`${JSON.stringify(outcome.report, null, 2)}\n`);
if (outcome.error) process.stderr.write(`${outcome.error.message}\n`);
process.exitCode = outcome.exitCode;
