import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBaselineManifest,
  validateCodeowners,
  validateRepositoryLayout,
  validateSensitivePaths,
} from "../lib/governance-checks.mjs";

const policy = {
  activeWp: "WP-001",
  allowedTopLevel: [".github", "docs", "tooling", "package.json"],
  requiredFiles: [".github/CODEOWNERS", "docs/baselines/BASELINE_MANIFEST.json"],
  forbiddenPathSegments: ["shared"],
  reservedTopLevelBirths: {
    apps: "WP-003",
    services: "WP-004",
    packages: "WP-003",
    database: "WP-005",
    tests: "WP-002",
    infra: "WP-028"
  }
};

const validManifest = {
  schemaVersion: 1,
  authorityOrder: [
    "product",
    "architecture",
    "technicalArchitecture",
    "stack",
    "implementationPlan"
  ],
  baselines: [
    {
      authority: "product",
      archive: "PRODUCT.zip",
      sha256: "a".repeat(64),
      status: "Approved",
      version: "1.0",
      documents: [{ path: "PRD.md", sha256: "b".repeat(64) }]
    },
    {
      authority: "architecture",
      archive: "ARCHITECTURE.zip",
      sha256: "c".repeat(64),
      status: "Approved",
      version: "1.0",
      documents: [{ path: "ARCHITECTURE.md", sha256: "d".repeat(64) }]
    },
    {
      authority: "technicalArchitecture",
      archive: "TECHNICAL.zip",
      sha256: "e".repeat(64),
      status: "Approved",
      version: "1.0",
      documents: [{ path: "TECHNICAL.md", sha256: "f".repeat(64) }]
    },
    {
      authority: "stack",
      archive: "STACK.zip",
      sha256: "1".repeat(64),
      status: "Approved",
      version: "1.0",
      documents: [{ path: "STACK.md", sha256: "2".repeat(64) }]
    },
    {
      authority: "implementationPlan",
      archive: "PLAN.zip",
      sha256: "3".repeat(64),
      status: "Approved",
      version: "1.0",
      documents: [{ path: "PLAN.md", sha256: "4".repeat(64) }]
    }
  ]
};

test("accepts the authorized WP-001 repository surface", () => {
  const paths = [
    ".github/CODEOWNERS",
    "docs/baselines/BASELINE_MANIFEST.json",
    "package.json",
    "tooling/governance/check-repository.mjs"
  ];

  assert.deepEqual(validateRepositoryLayout(paths, policy), []);
});

test("rejects roots whose birth belongs to a later WP", () => {
  const errors = validateRepositoryLayout(
    [".github/CODEOWNERS", "docs/baselines/BASELINE_MANIFEST.json", "apps/mobile/index.ts"],
    policy
  );

  assert.ok(errors.some((error) => error.includes("apps") && error.includes("WP-003")));
});

test("rejects a shared path segment", () => {
  const errors = validateRepositoryLayout(
    [
      ".github/CODEOWNERS",
      "docs/baselines/BASELINE_MANIFEST.json",
      "tooling/shared/config.json"
    ],
    policy
  );

  assert.ok(errors.some((error) => error.includes("shared")));
});

test("rejects sensitive file paths while allowing explicit examples", () => {
  assert.deepEqual(validateSensitivePaths(["docs/.env.example"]), []);

  const errors = validateSensitivePaths([".env", "certificates/signing-key.pem", "mobile.p12"]);
  assert.equal(errors.length, 3);
});

test("requires central CODEOWNERS ownership", () => {
  assert.deepEqual(validateCodeowners("* @Jvms04\n"), []);
  assert.ok(validateCodeowners("* @fictional-team\n").length > 0);
});

test("accepts an approved five-baseline manifest in authority order", () => {
  assert.deepEqual(validateBaselineManifest(validManifest), []);
});

test("rejects non-approved authority and malformed hashes", () => {
  const manifest = structuredClone(validManifest);
  manifest.baselines[2].status = "Draft";
  manifest.baselines[4].sha256 = "not-a-hash";

  const errors = validateBaselineManifest(manifest);
  assert.ok(errors.some((error) => error.includes("Draft")));
  assert.ok(errors.some((error) => error.includes("sha256")));
});
