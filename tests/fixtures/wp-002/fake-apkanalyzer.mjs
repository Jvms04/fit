#!/usr/bin/env node

import process from "node:process";

const command = process.argv.slice(2, -1).join(" ");
const values = {
  "manifest application-id": "com.fit.wp002probe",
  "manifest version-code": "1",
  "manifest version-name": "0.0.0",
  "manifest debuggable": "false"
};

if (!(command in values)) {
  process.stderr.write(`unsupported fake apkanalyzer command: ${command}\n`);
  process.exit(2);
}

process.stdout.write(`${values[command]}\n`);
