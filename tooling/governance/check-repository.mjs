import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  validateBaselineManifest,
  validateCodeowners,
  validateRepositoryLayout,
  validateSensitivePaths
} from "./lib/governance-checks.mjs";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "coverage"]);

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

const policy = JSON.parse(
  await readFile(path.join(root, "tooling/governance/policies/repository-policy.json"), "utf8")
);
const manifest = JSON.parse(
  await readFile(path.join(root, "docs/baselines/BASELINE_MANIFEST.json"), "utf8")
);
const codeowners = await readFile(path.join(root, ".github/CODEOWNERS"), "utf8");
const files = await listFiles(root);

const errors = [
  ...validateRepositoryLayout(files, policy),
  ...validateSensitivePaths(files),
  ...validateCodeowners(codeowners),
  ...validateBaselineManifest(manifest)
];

if (errors.length > 0) {
  console.error("WP-001 governance check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`WP-001 governance check passed (${files.length} tracked-surface files inspected).`);
  console.log("No VAL result was produced by this check.");
}
