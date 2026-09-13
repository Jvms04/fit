import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../temporal/wp-002/run-os-tzdb-divergence.mjs", import.meta.url)
);

test("OS-TZDB divergence runner emits partial evidence without fallback or promotion", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, "VAL006_OS_TZDB_DIVERGENCE_PARTIAL_EVIDENCE");
  assert.equal(report.scenario.divergenceDetected, true);
  assert.equal(report.scenario.authority, "VERSIONED_BUNDLE");
  assert.equal(report.ruleBase.bundleSha256,
    "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81");
  assert.equal(report.fixture.hashVerified, true);
  assert.equal(report.syntheticOsOracle, true);
  assert.equal(report.canonicalPromotion, false);
  assert.equal(report.fallbackActivated, false);
});

test("CI pins the exact Node runtime used by the accepted partial evidence", async () => {
  const workflow = await readFile(
    fileURLToPath(new URL("../../../.github/workflows/wp-002-g0.yml", import.meta.url)),
    "utf8"
  );

  const configuredRuntimes = [...workflow.matchAll(/node-version:\s*([^\s#]+)/gu)].map(
    ([, version]) => version
  );
  assert.deepEqual(configuredRuntimes, ["24.19.0", "24.19.0", "24.19.0"]);
});
