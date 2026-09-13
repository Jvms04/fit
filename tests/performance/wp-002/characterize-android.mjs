#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";

import { parseAmStartOutput, parseDeviceList, parseTotalPssKb } from "./lib/android-output.mjs";
import { evaluateLaunchAttempts } from "./lib/metrics.mjs";
import { portableInvocation } from "./lib/portable-command.mjs";

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near '${key ?? "end"}'`);
    }
    values.set(key.slice(2), value);
  }
  return values;
}

const args = readArguments(process.argv.slice(2));
const adb = args.get("adb") ?? process.env.ADB_BIN ?? "adb";
const serial = args.get("serial");
const packageName = args.get("package") ?? "com.fit.wp002probe";
const activity = args.get("activity") ?? `${packageName}/.MainActivity`;
const samples = Number(args.get("samples") ?? "5");

if (!serial) {
  throw new Error("--serial is required; never guess the target device");
}
if (!Number.isInteger(samples) || samples < 3 || samples > 10) {
  throw new Error("initial characterization requires 3-10 samples; formal 30-run validation is gated");
}

function runAdb(commandArgs, options = {}) {
  const invocation = portableInvocation(adb, ["-s", serial, ...commandArgs]);
  return execFileSync(invocation.executable, invocation.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

const devicesInvocation = portableInvocation(adb, ["devices", "-l"]);
const devicesOutput = execFileSync(devicesInvocation.executable, devicesInvocation.args, { encoding: "utf8" });
const selected = parseDeviceList(devicesOutput).find((device) => device.serial === serial);
if (!selected || selected.state !== "device") {
  throw new Error(`selected Android device is not authorized and online (state: ${selected?.state ?? "absent"})`);
}

const getProp = (name) => runAdb(["shell", "getprop", name]);
const installed = runAdb(["shell", "pm", "path", packageName]);
if (!installed.startsWith("package:")) {
  throw new Error(`probe package '${packageName}' is not installed on the selected device`);
}

runAdb(["logcat", "-c"]);

const cold = [];
const warm = [];

for (let index = 0; index < samples; index += 1) {
  runAdb(["shell", "am", "force-stop", packageName]);
  const launch = parseAmStartOutput(runAdb(["shell", "am", "start", "-W", "-n", activity]));
  const memoryOutput = runAdb(["shell", "dumpsys", "meminfo", packageName]);
  cold.push({
    sample: index + 1,
    launch,
    totalPssKb: parseTotalPssKb(memoryOutput)
  });

  runAdb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  const warmLaunch = parseAmStartOutput(runAdb(["shell", "am", "start", "-W", "-n", activity]));
  warm.push({ sample: index + 1, launch: warmLaunch });
}

const coldEvaluation = evaluateLaunchAttempts(cold, "COLD");
const warmEvaluation = evaluateLaunchAttempts(warm, "WARM");
const eligibleForSp007Characterization =
  coldEvaluation.measuredCount === samples && warmEvaluation.measuredCount === samples;
const serialRef = createHash("sha256").update(serial).digest("hex").slice(0, 12);

const report = {
  schemaVersion: 1,
  protocol: "SP-007",
  stage: "INITIAL-CHARACTERIZATION",
  attemptClassification: eligibleForSp007Characterization
    ? "INITIAL_CHARACTERIZATION_CANDIDATE"
    : "ABORTED_DIAGNOSTIC",
  disposition: eligibleForSp007Characterization ? "PARTIAL" : "DIAGNOSTIC-ONLY",
  generatedAt: new Date().toISOString(),
  budgetApplied: false,
  formalValidation: false,
  protocolValidity: {
    eligibleForSp007Characterization,
    expectedLaunchStates: ["COLD", "WARM"],
    warmPreparation: "KEYCODE_BACK",
    totalTimePolicy: "TotalTime is required; WaitTime is retained raw and never substituted"
  },
  environment: {
    serialRef: `sha256:${serialRef}`,
    manufacturer: getProp("ro.product.manufacturer"),
    model: getProp("ro.product.model"),
    device: getProp("ro.product.device"),
    androidRelease: getProp("ro.build.version.release"),
    apiLevel: getProp("ro.build.version.sdk"),
    buildFingerprint: getProp("ro.build.fingerprint"),
    wmSize: runAdb(["shell", "wm", "size"]),
    wmDensity: runAdb(["shell", "wm", "density"]),
    adb: (() => {
      const invocation = portableInvocation(adb, ["version"]);
      return execFileSync(invocation.executable, invocation.args, { encoding: "utf8" }).trim();
    })()
  },
  subject: { packageName, activity, samples },
  raw: {
    cold: coldEvaluation.records,
    warm: warmEvaluation.records,
    probeLog: runAdb(["logcat", "-d", "-v", "epoch", "ReactNativeJS:I", "*:S"])
      .split(/\r?\n/)
      .filter((line) => line.includes("[FIT_WP002]"))
  },
  summaries: {
    coldTotalTime: coldEvaluation.totalTime,
    warmTotalTime: warmEvaluation.totalTime
  },
  limitations: [
    "single Android physical device row",
    "initial sample only; not the 30-run VAL-001 protocol",
    "no approved budget applied",
    "no iOS physical evidence",
    "does not establish minimum, intermediate, or current support matrix",
    ...(eligibleForSp007Characterization
      ? []
      : ["one or more requested launch samples were ineligible; this output is diagnostic only"])
  ]
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!eligibleForSp007Characterization) {
  process.exitCode = 2;
}
