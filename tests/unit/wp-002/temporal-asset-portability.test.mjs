import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("Git checkout preserves exact bytes for every hashed VAL-006 artifact", () => {
  const paths = [
    "tests/temporal/wp-002/fixtures/synthetic-future-revision.json",
    "docs/evidence/wp-002/raw/VAL006_NODE24_PARTIAL.json"
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
