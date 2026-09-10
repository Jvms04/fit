#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
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
      return { nextLaunchState: "UNKNOWN (0)", coldCount: 0, warmCount: 0 };
    }
    throw error;
  }
}

function writeState(state) {
  writeFileSync(statePath, JSON.stringify(state));
}

const args = process.argv.slice(2);
if (args.join(" ") === "devices -l") {
  process.stdout.write("List of devices attached\nsynthetic device product:dm3q model:SM_S911B device:dm3q transport_id:1\n");
  process.exit(0);
}
if (args[0] === "version") {
  process.stdout.write("Android Debug Bridge version 1.0.41\nVersion 37.0.1-test\n");
  process.exit(0);
}

const command = args.slice(2);
const state = readState();

if (command[0] === "logcat") {
  if (command[1] === "-d") {
    process.stdout.write("0.0 ReactNativeJS: I [FIT_WP002] synthetic-marker\n");
  }
  process.exit(0);
}
if (command.join(" ").startsWith("shell pm path ")) {
  process.stdout.write("package:/data/app/com.fit.wp002probe/base.apk\n");
  process.exit(0);
}
if (command.join(" ").startsWith("shell am force-stop ")) {
  state.nextLaunchState = "COLD";
  writeState(state);
  process.exit(0);
}
if (command.join(" ").startsWith("shell input keyevent ")) {
  const keycode = command.at(-1);
  state.nextLaunchState = process.env.FAKE_ADB_FORCE_UNKNOWN === "1"
    ? "UNKNOWN (0)"
    : keycode === "KEYCODE_BACK" ? "WARM" : "UNKNOWN (0)";
  writeState(state);
  process.exit(0);
}
if (command.join(" ").startsWith("shell am start -W -n ")) {
  const launchState = state.nextLaunchState;
  const measured = launchState === "COLD" || launchState === "WARM";
  const counterKey = launchState === "COLD" ? "coldCount" : "warmCount";
  state[counterKey] += 1;
  writeState(state);
  const totalTime = launchState === "COLD"
    ? 200 + state.coldCount
    : 100 + state.warmCount;
  const lines = [
    "Status: ok",
    `LaunchState: ${launchState}`,
    "Activity: com.fit.wp002probe/.MainActivity",
    ...(measured ? [`TotalTime: ${totalTime}`] : []),
    `WaitTime: ${totalTime + 1}`,
    "Complete"
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}
if (command.join(" ").startsWith("shell dumpsys meminfo ")) {
  const totalPssKb = process.env.FAKE_ADB_PSS_KB ?? "183420";
  process.stdout.write(` TOTAL PSS: ${totalPssKb} TOTAL RSS: 240000\n`);
  process.exit(0);
}
if (command[0] === "shell" && command[1] === "getprop") {
  const values = {
    "ro.product.manufacturer": "samsung",
    "ro.product.model": "SM-S911B",
    "ro.product.device": "dm3q",
    "ro.build.version.release": "16",
    "ro.build.version.sdk": "36",
    "ro.build.fingerprint": "synthetic/fingerprint"
  };
  process.stdout.write(`${values[command[2]] ?? ""}\n`);
  process.exit(0);
}
if (command.join(" ") === "shell wm size") {
  process.stdout.write("Physical size: 1080x2340\n");
  process.exit(0);
}
if (command.join(" ") === "shell wm density") {
  process.stdout.write("Physical density: 420\n");
  process.exit(0);
}

process.stderr.write(`unsupported fake adb command: ${args.join(" ")}\n`);
process.exit(2);
