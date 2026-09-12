import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildNode24Report } from "../../temporal/wp-002/run-node-val006.mjs";

const implementation = await import(
  "../../native/wp-002-mobile-harness/val006/hermes-protocol.mjs"
).catch(() => ({}));

const canonicalCorpusUrl = new URL(
  "../../temporal/wp-002/fixtures/node24-vectors.json",
  import.meta.url
);
const canonicalRuleBaseUrl = new URL(
  "../../../node_modules/moment-timezone/data/packed/latest.json",
  import.meta.url
);

const EXPECTED_RULE_BASE_SHA256 =
  "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
const EXPECTED_CORPUS_SHA256 =
  "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";

async function fixture() {
  const generator = await import(
    "../../native/wp-002-mobile-harness/scripts/prepare-val006-assets.mjs"
  );
  const outputDirectory = await mkdtemp(join(tmpdir(), "fit-val006-hermes-assets-"));
  await generator.prepareHermesAssets(outputDirectory);
  const [canonicalCorpus, hermesCorpus, canonicalRuleBase, hermesRuleBase] =
    await Promise.all([
      readFile(canonicalCorpusUrl),
      readFile(join(outputDirectory, "node24-vectors.corpus")),
      readFile(canonicalRuleBaseUrl),
      readFile(join(outputDirectory, "iana-2026c.tzdb"))
    ]);
  await rm(outputDirectory, { recursive: true, force: true });
  return { canonicalCorpus, hermesCorpus, canonicalRuleBase, hermesRuleBase };
}

test("Hermes assets are byte-identical to the approved Node corpus and IANA 2026c bundle", async () => {
  const { canonicalCorpus, hermesCorpus, canonicalRuleBase, hermesRuleBase } = await fixture();

  assert.deepEqual(hermesCorpus, canonicalCorpus);
  assert.deepEqual(hermesRuleBase, canonicalRuleBase);
  assert.equal(createHash("sha256").update(hermesCorpus).digest("hex"), EXPECTED_CORPUS_SHA256);
  assert.equal(
    createHash("sha256").update(hermesRuleBase).digest("hex"),
    EXPECTED_RULE_BASE_SHA256
  );
});

test("Hermes candidate is field-by-field comparable to all five Node vectors", async () => {
  assert.equal(
    typeof implementation.buildHermesAndroidReport,
    "function",
    "buildHermesAndroidReport must exist"
  );
  const { hermesCorpus, hermesRuleBase } = await fixture();
  const nodeReport = await buildNode24Report("v24.19.0");
  const report = implementation.buildHermesAndroidReport({
    runtime: {
      engine: "Hermes",
      hermesInternalPresent: true,
      platform: "android"
    },
    corpusBytes: new Uint8Array(hermesCorpus),
    corpusSha256: EXPECTED_CORPUS_SHA256,
    ruleBaseBytes: new Uint8Array(hermesRuleBase),
    ruleBaseSha256: EXPECTED_RULE_BASE_SHA256
  });

  assert.equal(report.classification, "VAL006_HERMES_ANDROID_RUNTIME_CANDIDATE");
  assert.equal(report.runtime.engineVerified, true);
  assert.equal(report.ruleBase.id, nodeReport.ruleBase.id);
  assert.equal(report.ruleBase.bundleSha256, nodeReport.ruleBase.bundleSha256);
  assert.equal(report.corpus.sha256, EXPECTED_CORPUS_SHA256);
  assert.equal(report.vectorSummary.total, 5);
  assert.equal(report.vectorSummary.matched, 5);
  assert.equal(report.comparison.comparable, true);
  assert.deepEqual(report.vectors, nodeReport.vectors);
  assert.deepEqual(report.comparison.fields, [
    "id",
    "input",
    "expected",
    "actual",
    "matchesExpected"
  ]);
  assert.equal(report.osTzdbDivergence, "NOT-EXECUTED");
  assert.equal(report.hermes.ios, "BLOCKED");
  assert.equal(report.canonicalPromotion, false);
  assert.equal(report.fallbackActivated, false);
});

test("rule-base or runtime divergence blocks comparison before vector execution", async () => {
  assert.equal(typeof implementation.buildHermesAndroidReport, "function");
  const { hermesCorpus, hermesRuleBase } = await fixture();
  const base = {
    runtime: {
      engine: "Hermes",
      hermesInternalPresent: true,
      platform: "android"
    },
    corpusBytes: new Uint8Array(hermesCorpus),
    corpusSha256: EXPECTED_CORPUS_SHA256,
    ruleBaseBytes: new Uint8Array(hermesRuleBase),
    ruleBaseSha256: EXPECTED_RULE_BASE_SHA256
  };

  assert.throws(
    () => implementation.buildHermesAndroidReport({ ...base, ruleBaseSha256: "0".repeat(64) }),
    /rule-base SHA-256 mismatch/
  );
  assert.throws(
    () =>
      implementation.buildHermesAndroidReport({
        ...base,
        runtime: { engine: "JavaScriptCore", hermesInternalPresent: false, platform: "android" }
      }),
    /Hermes runtime proof required/
  );
});

test("Hermes protocol code has no Node-only API dependency", async () => {
  const sources = await Promise.all([
    readFile(
      new URL(
        "../../native/wp-002-mobile-harness/val006/hermes-protocol.mjs",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../../native/wp-002-mobile-harness/val006/run-hermes-android.ts",
        import.meta.url
      ),
      "utf8"
    )
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']node:/);
  }
});
