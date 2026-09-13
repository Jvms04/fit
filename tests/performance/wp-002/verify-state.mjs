#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import { validateWp002State } from "./lib/protocol-state.mjs";

const statePath = new URL("../../../docs/evidence/wp-002/STATE.json", import.meta.url);
const state = JSON.parse(await readFile(statePath, "utf8"));
const errors = validateWp002State(state);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("WP-002 protocol state is coherent; no canonical VAL was promoted to PASS.");
}
