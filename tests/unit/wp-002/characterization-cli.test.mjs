import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("../../performance/wp-002/characterize-android.mjs", import.meta.url)
);

test("refuses to turn the initial characterization into the formal 30-run protocol", () => {
  const result = spawnSync(process.execPath, [script, "--serial", "synthetic", "--samples", "30"], {
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /formal 30-run validation is gated/);
});

test("requires an explicit device selector", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--serial is required/);
});
