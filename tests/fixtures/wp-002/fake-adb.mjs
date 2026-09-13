#!/usr/bin/env node

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const statePath = process.env.FAKE_ADB_STATE;
if (!statePath) {
  throw new Error("FAKE_ADB_STATE is required");
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        nextLaunchState: "UNKNOWN (0)", coldCount: 0, warmCount: 0,
        forceStopCount: 0, preflightStarted: false, exitRecords: [],
        activityTopResumed: false, warmLaunchAttemptCount: 0,
        keyBackCount: 0, processAlive: false, exitSequence: 0,
        midrunCrashInjected: false
      };
    }
    throw error;
  }
}

function writeState(state) {
  writeFileSync(statePath, JSON.stringify(state));
}

function exitRecord({ index, eventId = index, reason, label, processName = "com.fit.wp002probe", status = 0 }) {
  return [
    `ApplicationExitInfo #${index}:`,
    `  timestamp=2026-09-10 10:${String(eventId % 60).padStart(2, "0")}:00.000 pid=${5000 + eventId} realUid=10345 packageUid=10345 definingUid=10345 user=0`,
    `  process=${processName} reason=${reason} (${label}) subreason=0 (UNKNOWN) status=${status}`,
    `  importance=100 pss=110000kB rss=190000kB description=${label}`
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.join(" ") === "devices -l") {
  process.stdout.write([
    "List of devices attached",
    "synthetic device product:dm3q model:SM_S911B device:dm3q transport_id:1",
    "serial-raw-must-not-appear device product:dm3q model:SM_S911B device:dm3q transport_id:3",
    "other-secret-serial device product:other model:OTHER device:other transport_id:2",
    ""
  ].join("\n"));
  process.exit(0);
}
if (args[0] === "version") {
  process.stdout.write("Android Debug Bridge version 1.0.41\nVersion 37.0.1-test\n");
  process.exit(0);
}

const command = args.slice(2);
const state = readState();
const joined = command.join(" ");

if (command[0] === "pull") {
  const installedApk = process.env.FAKE_ADB_INSTALLED_APK;
  if (!installedApk) {
    process.stderr.write("FAKE_ADB_INSTALLED_APK is required for pull\n");
    process.exit(2);
  }
  copyFileSync(installedApk, command[2]);
  process.stdout.write("1 file pulled\n");
  process.exit(0);
}
if (command[0] === "logcat") {
  if (command.includes("-d")) {
    if (process.env.FAKE_ADB_OTHER_APP_CRASH === "1") {
      process.stdout.write("FATAL EXCEPTION: main Process: com.other.application\n");
    }
    if (state.preflightStarted) {
      const rowCount = Number(process.env.FAKE_ADB_RUNTIME_ROW_COUNT ?? "1000");
      process.stdout.write(
        "09-10 ReactNativeJS: I [FIT_WP002] " +
        JSON.stringify({
          status: "ready", sqliteVersion: "3.49.1", cipherVersion: "4.7.0 community",
          rowCount, readyMs: 55
        }) + "\n"
      );
      if (process.env.FAKE_ADB_HERMES_REPORT) {
        const hermesReport = readFileSync(process.env.FAKE_ADB_HERMES_REPORT, "utf8").trim();
        process.stdout.write(`09-10 ReactNativeJS: I [FIT_WP002_VAL006_HERMES] ${hermesReport}\n`);
      }
    }
  }
  process.exit(0);
}
if (joined.startsWith("shell pm path ")) {
  const requestedPackage = command.at(-1);
  if (requestedPackage !== (process.env.FAKE_ADB_INSTALLED_PACKAGE ?? "com.fit.wp002probe")) {
    process.stderr.write(`package ${requestedPackage} was not found\n`);
    process.exit(1);
  }
  process.stdout.write("package:/data/app/com.fit.wp002probe/base.apk\n");
  process.exit(0);
}
if (joined.startsWith("shell am force-stop ")) {
  const failAfterPairs = Number(process.env.FAKE_ADB_FAIL_AFTER_PAIRS ?? "-1");
  if (Number.isInteger(failAfterPairs) && failAfterPairs >= 0 && state.coldCount >= failAfterPairs) {
    process.stderr.write("synthetic transport failure after acquired pairs\n");
    process.exit(2);
  }
  state.forceStopCount += 1;
  state.nextLaunchState = "COLD";
  state.activityTopResumed = false;
  state.processAlive = false;
  state.exitSequence = (state.exitSequence ?? 0) + 1;
  state.exitRecords.unshift({
    eventId: state.exitSequence, reason: 10, label: "user request", status: 0
  });
  writeState(state);
  process.exit(0);
}
if (joined.startsWith("shell input keyevent ")) {
  const keycode = command.at(-1);
  state.keyBackCount = (state.keyBackCount ?? 0) + 1;
  const stuckAfter = Number(process.env.FAKE_ADB_WARM_ACTIVITY_STUCK_AFTER ?? "-1");
  const warmActivityStuck = process.env.FAKE_ADB_WARM_ACTIVITY_STUCK === "1" ||
    (Number.isInteger(stuckAfter) && stuckAfter >= 1 && state.keyBackCount >= stuckAfter);
  state.nextLaunchState = process.env.FAKE_ADB_FORCE_UNKNOWN === "1" || warmActivityStuck
    ? "UNKNOWN (0)"
    : keycode === "KEYCODE_BACK" ? "WARM" : "UNKNOWN (0)";
  state.activityTopResumed = warmActivityStuck;
  if (process.env.FAKE_ADB_PROCESS_DIES_ON_BACK === "1") state.processAlive = false;
  writeState(state);
  process.exit(0);
}
if (joined.startsWith("shell dumpsys activity activities ")) {
  const resumedComponent = state.activityTopResumed
    ? "com.fit.wp002probe/.MainActivity"
    : "com.sec.android.app.launcher/.Launcher";
  process.stdout.write([
    "ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)",
    `mResumedActivity: ActivityRecord{synthetic u0 ${resumedComponent} t1}`,
    `topResumedActivity=ActivityRecord{synthetic u0 ${resumedComponent} t1}`,
    "* Hist #0: ActivityRecord{synthetic u0 com.fit.wp002probe/.MainActivity t2}",
    ""
  ].join("\n"));
  process.exit(0);
}
if (joined.startsWith("shell am start -W -n ")) {
  if (command.includes("provenance-preflight") || command.includes("val006-hermes-runtime")) {
    state.preflightStarted = true;
    state.nextLaunchState = "COLD";
    state.activityTopResumed = true;
    state.processAlive = true;
    writeState(state);
    process.stdout.write([
      "Status: ok", "LaunchState: COLD", "Activity: com.fit.wp002probe/.MainActivity",
      "TotalTime: 210", "WaitTime: 211", "Complete", ""
    ].join("\n"));
    process.exit(0);
  }
  if (command.includes("warm-preflight")) {
    state.activityTopResumed = true;
    state.nextLaunchState = "UNKNOWN (0)";
    state.processAlive = true;
    writeState(state);
    process.stdout.write([
      "Status: ok", "LaunchState: WARM", "Activity: com.fit.wp002probe/.MainActivity",
      "TotalTime: 100", "WaitTime: 101", "Complete", ""
    ].join("\n"));
    process.exit(0);
  }
  if (state.activityTopResumed && process.env.FAKE_ADB_WARM_ACTIVITY_STUCK === "1") {
    state.warmLaunchAttemptCount += 1;
    writeState(state);
    process.stdout.write([
      "Status: ok",
      "LaunchState: UNKNOWN (0)",
      "Activity: com.fit.wp002probe/.MainActivity",
      "TotalTime: 0",
      "WaitTime: 18",
      "Warning: Activity not started, intent has been delivered to currently running top-most instance.",
      "Complete",
      ""
    ].join("\n"));
    process.exit(0);
  }
  const launchState = state.nextLaunchState;
  const measured = launchState === "COLD" || launchState === "WARM";
  const counterKey = launchState === "COLD" ? "coldCount" : "warmCount";
  state[counterKey] += 1;
  const crashAfterWarm = Number(process.env.FAKE_ADB_MIDRUN_CRASH_AFTER_WARM ?? "-1");
  if (launchState === "WARM" && state.warmCount === crashAfterWarm && !state.midrunCrashInjected) {
    state.exitSequence = (state.exitSequence ?? 0) + 1;
    state.exitRecords.unshift({
      eventId: state.exitSequence, reason: 4, label: "crash", status: 0
    });
    state.midrunCrashInjected = true;
  }
  state.activityTopResumed = true;
  state.processAlive = true;
  writeState(state);
  const totalTime = launchState === "COLD" ? 200 + state.coldCount : 100 + state.warmCount;
  const emptyTotalTime = process.env.FAKE_ADB_EMPTY_TOTAL_TIME === launchState;
  const lines = [
    "Status: ok", `LaunchState: ${launchState}`,
    "Activity: com.fit.wp002probe/.MainActivity",
    ...(measured ? [`TotalTime: ${emptyTotalTime ? "" : totalTime}`] : []),
    `WaitTime: ${totalTime + 1}`, "Complete"
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}
if (joined.startsWith("shell dumpsys meminfo ")) {
  const totalPssKb = process.env.FAKE_ADB_PSS_KB ?? "183420";
  process.stdout.write(` TOTAL PSS: ${totalPssKb} TOTAL RSS: 240000\n`);
  process.exit(0);
}
if (joined.startsWith("shell dumpsys activity exit-info ")) {
  const historyLimit = Number(process.env.FAKE_ADB_EXIT_HISTORY_LIMIT ?? "1000");
  const records = [...state.exitRecords].slice(0, historyLimit);
  if (state.coldCount > 0 && process.env.FAKE_ADB_PROBE_EXIT_REASON) {
    records.unshift({
      reason: Number(process.env.FAKE_ADB_PROBE_EXIT_REASON),
      label: process.env.FAKE_ADB_PROBE_EXIT_LABEL ?? "injected abnormal exit",
      status: Number(process.env.FAKE_ADB_PROBE_EXIT_STATUS ?? "0")
    });
  }
  if (process.env.FAKE_ADB_OTHER_APP_EXIT === "1") {
    process.stdout.write(`${exitRecord({
      index: records.length + 1, reason: 4, label: "other app crash",
      processName: "com.other.application"
    })}\n`);
  }
  process.stdout.write(records.map((record, index) => exitRecord({ index, ...record })).join("\n"));
  if (records.length > 0) process.stdout.write("\n");
  process.exit(0);
}
if (joined === "shell pidof com.fit.wp002probe") {
  if (state.processAlive !== false) {
    process.stdout.write("4242\n");
    process.exit(0);
  }
  process.exit(1);
}
if (command[0] === "shell" && command[1] === "getprop") {
  const values = {
    "ro.product.manufacturer": process.env.FAKE_ADB_MANUFACTURER ?? "samsung",
    "ro.product.model": process.env.FAKE_ADB_MODEL ?? "SM-S911B",
    "ro.product.device": process.env.FAKE_ADB_DEVICE ?? "dm3q",
    "ro.build.version.release": process.env.FAKE_ADB_ANDROID_RELEASE ?? "16",
    "ro.build.version.sdk": process.env.FAKE_ADB_API_LEVEL ?? "36",
    "ro.build.fingerprint": "synthetic/fingerprint"
  };
  process.stdout.write(`${values[command[2]] ?? ""}\n`);
  process.exit(0);
}
if (joined === "shell wm size") {
  process.stdout.write("Physical size: 1080x2340\n");
  process.exit(0);
}
if (joined === "shell wm density") {
  process.stdout.write("Physical density: 420\n");
  process.exit(0);
}

process.stderr.write(`unsupported fake adb command: ${args.join(" ")}\n`);
process.exit(2);
