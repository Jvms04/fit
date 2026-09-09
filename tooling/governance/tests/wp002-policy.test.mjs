import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateRepositoryLayout } from "../lib/governance-checks.mjs";

const policy = JSON.parse(
  await readFile(
    new URL("../policies/repository-policy.json", import.meta.url),
    "utf8"
  )
);

test("WP-002 admits disposable tests without opening later repository roots", () => {
  assert.equal(policy.activeWp, "WP-002");

  const authorized = [
    ...policy.requiredFiles,
    "tests/native/wp-002-mobile-harness/App.tsx",
    "tests/fixtures/wp-002/sp007-characterization.json"
  ];
  assert.deepEqual(validateRepositoryLayout(authorized, policy), []);

  for (const path of [
    "apps/mobile/index.ts",
    "services/api/index.ts",
    "packages/domain/index.ts",
    "database/migrations/001.sql",
    "infra/main.tf"
  ]) {
    const errors = validateRepositoryLayout([...policy.requiredFiles, path], policy);
    assert.ok(errors.length > 0, `${path} must remain unavailable during WP-002`);
  }
});
