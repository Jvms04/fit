#!/usr/bin/env node

import process from "node:process";

const args = process.argv.slice(2);
const command = args.slice(2);

if (command[0] === "shell" && command[1] === "logcat") {
  if (!args.includes("-e")) {
    process.stdout.write("noise ".repeat(300_000));
    process.exit(0);
  }
  process.stdout.write([
    "09-14 ReactNativeJS: I [FIT_VAL0034] {\"status\":\"ready\"}",
    "09-14 ReactNativeJS: I [FIT_VAL0034_REKEY_STARTED] {\"phase\":\"rekey-started\"}",
    "09-14 ReactNativeJS: I [FIT_VAL0034_REKEY_COMPLETED] {\"phase\":\"rekey-completed\"}",
    "09-14 ReactNativeJS: I [FIT_VAL0034_APPSTATE] {\"state\":\"active\",\"sealed\":false}",
    ""
  ].join("\n"));
  process.exit(0);
}

process.stderr.write("unsupported fake command: " + args.join(" ") + "\n");
process.exit(2);
