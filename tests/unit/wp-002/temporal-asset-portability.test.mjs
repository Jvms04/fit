import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Git checkout preserves exact bytes for every hashed VAL-006 artifact", () => {
  const paths = [
    "tests/temporal/wp-002/fixtures/synthetic-future-revision.json",
    "tests/temporal/wp-002/fixtures/node24-vectors.json",
    "tests/temporal/wp-002/fixtures/os-tzdb-divergence.json",
    "docs/evidence/wp-002/SP007_S23_BUDGETS.json",
    "docs/evidence/wp-002/raw/VAL006_NODE24_PARTIAL.json",
    "docs/evidence/wp-002/raw/VAL006_OS_TZDB_DIVERGENCE_PARTIAL.json",
    "docs/evidence/wp-002/raw/VAL003_VAL004_STATIC_READINESS.json"
  ];
  const result = spawnSync("git", ["check-attr", "text", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  for (const path of paths) {
    assert.match(
      result.stdout,
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: text: unset`),
      `${path} must opt out of line-ending conversion because its SHA-256 identifies exact bytes`
    );
  }
});
