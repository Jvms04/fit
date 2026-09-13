import { fileURLToPath } from "node:url";

import { loadRuleBase, runCorpus } from "./lib/rule-base.mjs";
import {
  evaluateRuleBaseHandshake,
  loadSyntheticFutureRevision,
  simulateFutureRuleRevision
} from "./lib/protocol.mjs";

export function assertNode24(version) {
  const major = Number(/^v?(\d+)/.exec(version)?.[1]);
  if (major !== 24) {
    throw new Error(`VAL-006 Node parcel requires Node 24; received ${version}`);
  }
}

export async function buildNode24Report(version = process.version) {
  assertNode24(version);
  const [ruleBase, corpus, futureRevisionAsset] = await Promise.all([
    loadRuleBase(),
    runCorpus(),
    loadSyntheticFutureRevision()
  ]);
  const differentHash = ruleBase.ruleBaseId.replace(/.$/, (last) => (last === "0" ? "1" : "0"));
  const oldRuleBaseId = ruleBase.ruleBaseId;
  const futureRevision = simulateFutureRuleRevision({
    effectiveFromLocal: futureRevisionAsset.effectiveFromLocal,
    newRuleBaseId: futureRevisionAsset.ruleBaseId,
    revisedOffset: futureRevisionAsset.revisedOffset,
    records: [
      {
        recordRef: "consolidated-occurrence",
        nominalLocal: "2027-02-01T09:00:00",
        instant: "2027-02-01T14:00:00Z",
        offset: "-05:00",
        identity: "occurrence-stable-001",
        version: 7,
        ruleBaseId: oldRuleBaseId,
        consolidated: true
      },
      {
        recordRef: "future-unconsolidated",
        nominalLocal: "2027-02-01T09:00:00",
        instant: "2027-02-01T14:00:00Z",
        offset: "-05:00",
        identity: "future-material-001",
        version: 2,
        ruleBaseId: oldRuleBaseId,
        consolidated: false
      },
      {
        recordRef: "past-unconsolidated",
        nominalLocal: "2026-12-01T09:00:00",
        instant: "2026-12-01T14:00:00Z",
        offset: "-05:00",
        identity: "past-material-001",
        version: 3,
        ruleBaseId: oldRuleBaseId,
        consolidated: false
      }
    ]
  });
  const matched = corpus.vectors.filter(({ matchesExpected }) => matchesExpected).length;

  return {
    schemaVersion: 1,
    wp: "WP-002",
    validation: "VAL-006",
    classification: "VAL006_NODE24_PARTIAL_EVIDENCE",
    runtime: { family: "Node", version, major: 24 },
    dependencies: {
      temporalPolyfill: "0.5.1",
      momentTimezone: ruleBase.packageVersion,
      tzdb: ruleBase.tzdbVersion
    },
    ruleBase: {
      id: ruleBase.ruleBaseId,
      bundleSha256: ruleBase.bundleSha256,
      bundleSizeBytes: ruleBase.bundleSizeBytes,
      bundlePath: "node_modules/moment-timezone/data/packed/latest.json"
    },
    vectorSummary: { total: corpus.vectors.length, matched },
    vectors: corpus.vectors,
    handshake: {
      sameRevision: evaluateRuleBaseHandshake({
        localRuleBaseId: ruleBase.ruleBaseId,
        remoteRuleBaseId: ruleBase.ruleBaseId
      }),
      differentHash: evaluateRuleBaseHandshake({
        localRuleBaseId: ruleBase.ruleBaseId,
        remoteRuleBaseId: differentHash
      })
    },
    futureRevisionAsset: {
      id: futureRevisionAsset.id,
      scope: futureRevisionAsset.scope,
      zone: futureRevisionAsset.zone,
      effectiveFromLocal: futureRevisionAsset.effectiveFromLocal,
      revisedOffset: futureRevisionAsset.revisedOffset,
      assetPath: "tests/temporal/wp-002/fixtures/synthetic-future-revision.json",
      assetSizeBytes: futureRevisionAsset.assetSizeBytes,
      assetSha256: futureRevisionAsset.assetSha256,
      ruleBaseId: futureRevisionAsset.ruleBaseId,
      hashVerified: futureRevisionAsset.hashVerified
    },
    futureRevision,
    networkRequired: false,
    hermes: { android: "NOT-EXECUTED", ios: "BLOCKED" },
    canonicalPromotion: false,
    fallbackActivated: false,
    remainingProtocol: [
      "Hermes Android with the identical versioned bundle and corpus",
      "Hermes iOS with the identical versioned bundle and corpus",
      "cross-runtime byte-for-byte vector comparison",
      "deliberately divergent OS TZDB check"
    ]
  };
}

async function main() {
  const report = await buildNode24Report();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
