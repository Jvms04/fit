import { fileURLToPath } from "node:url";

import { loadRuleBase } from "./lib/rule-base.mjs";
import {
  evaluateOsTzdbDivergence,
  loadOsTzdbDivergence
} from "./lib/protocol.mjs";

export async function buildOsTzdbDivergenceReport() {
  const [ruleBase, fixture] = await Promise.all([
    loadRuleBase(),
    loadOsTzdbDivergence()
  ]);
  const input = { local: "2026-03-08T02:30:00", zone: "America/New_York" };
  const withRuleBaseId = ruleBase.resolveLocal(input);
  const bundled = {
    classification: withRuleBaseId.classification,
    requestedLocal: withRuleBaseId.requestedLocal,
    resolvedLocal: withRuleBaseId.resolvedLocal,
    instant: withRuleBaseId.instant,
    offset: withRuleBaseId.offset
  };
  const scenario = evaluateOsTzdbDivergence({
    bundled,
    bundledRuleBaseId: ruleBase.ruleBaseId,
    fixture
  });

  return {
    schemaVersion: 1,
    wp: "WP-002",
    validation: "VAL-006",
    classification: "VAL006_OS_TZDB_DIVERGENCE_PARTIAL_EVIDENCE",
    runtime: { family: "Node", version: process.version },
    ruleBase: {
      id: ruleBase.ruleBaseId,
      bundleSha256: ruleBase.bundleSha256,
      tzdbVersion: ruleBase.tzdbVersion,
      authority: "VERSIONED_BUNDLE"
    },
    fixture: {
      id: fixture.id,
      path: "tests/temporal/wp-002/fixtures/os-tzdb-divergence.json",
      sizeBytes: fixture.assetSizeBytes,
      sha256: fixture.assetSha256,
      hashVerified: fixture.hashVerified
    },
    syntheticOsOracle: true,
    actualOsTzdbMutated: false,
    networkRequired: false,
    scenario,
    canonicalPromotion: false,
    automaticPromotion: false,
    fallbackActivated: false,
    limitations: [
      "controlled divergent OS oracle; the host OS TZDB was not mutated",
      "does not replace Hermes Android or Hermes iOS runtime evidence",
      "does not complete canonical VAL-006"
    ]
  };
}

async function main() {
  process.stdout.write(`${JSON.stringify(await buildOsTzdbDivergenceReport(), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
