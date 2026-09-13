import { Temporal } from "@js-temporal/polyfill";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const FUTURE_REVISION_URL = new URL("../fixtures/synthetic-future-revision.json", import.meta.url);
const EXPECTED_FUTURE_REVISION_SHA256 = "9f2e71444ea8d2541702843c386032e62f8a5b9f10360440fd9fdfe2a779feaa";
const OS_TZDB_DIVERGENCE_URL = new URL("../fixtures/os-tzdb-divergence.json", import.meta.url);
const EXPECTED_OS_TZDB_DIVERGENCE_SHA256 =
  "44a29708e16ef3f33be69e40f61a19dfd816158569ce26ccc142f3c290d59058";

export async function loadSyntheticFutureRevision() {
  const bytes = await readFile(FUTURE_REVISION_URL);
  const assetSha256 = createHash("sha256").update(bytes).digest("hex");
  if (assetSha256 !== EXPECTED_FUTURE_REVISION_SHA256) {
    throw new Error(
      `synthetic future revision hash mismatch: expected ${EXPECTED_FUTURE_REVISION_SHA256}, received ${assetSha256}`
    );
  }
  const revision = JSON.parse(bytes.toString("utf8"));
  return {
    ...revision,
    assetPath: FUTURE_REVISION_URL,
    assetSizeBytes: bytes.length,
    assetSha256,
    ruleBaseId: `iana-synthetic-future+sha256:${assetSha256}`,
    hashVerified: true
  };
}

export async function loadOsTzdbDivergence() {
  const bytes = await readFile(OS_TZDB_DIVERGENCE_URL);
  const assetSha256 = createHash("sha256").update(bytes).digest("hex");
  if (assetSha256 !== EXPECTED_OS_TZDB_DIVERGENCE_SHA256) {
    throw new Error(
      `OS-TZDB divergence fixture hash mismatch: expected ${EXPECTED_OS_TZDB_DIVERGENCE_SHA256}, received ${assetSha256}`
    );
  }
  const fixture = JSON.parse(bytes.toString("utf8"));
  if (
    fixture.schemaVersion !== 1 ||
    fixture.id !== "synthetic-os-tzdb-divergence" ||
    fixture.vectorId !== "ny-gap-next-valid" ||
    typeof fixture.osRuleBaseId !== "string" ||
    !fixture.osObserved
  ) {
    throw new Error("OS-TZDB divergence fixture contract is invalid");
  }
  return {
    ...fixture,
    assetPath: OS_TZDB_DIVERGENCE_URL,
    assetSizeBytes: bytes.length,
    assetSha256,
    hashVerified: true
  };
}

export function evaluateOsTzdbDivergence({ bundled, bundledRuleBaseId, fixture }) {
  const divergenceDetected = JSON.stringify(bundled) !== JSON.stringify(fixture.osObserved);
  if (!divergenceDetected) {
    throw new Error("controlled OS-TZDB oracle is not divergent from the versioned bundle");
  }
  return {
    classification: "OS_TZDB_DIVERGENCE_DETECTED",
    divergenceDetected: true,
    authority: "VERSIONED_BUNDLE",
    bundledRuleBaseId,
    osRuleBaseId: fixture.osRuleBaseId,
    selected: bundled,
    osObserved: fixture.osObserved,
    canonicalPromotion: false
  };
}

export function evaluateRuleBaseHandshake({ localRuleBaseId, remoteRuleBaseId }) {
  const skewDetected = localRuleBaseId !== remoteRuleBaseId;
  return {
    classification: skewDetected ? "RULE_BASE_SKEW" : "MATCH",
    skewDetected
  };
}

export function simulateFutureRuleRevision({
  records,
  effectiveFromLocal,
  newRuleBaseId,
  revisedOffset
}) {
  const effectiveFrom = Temporal.PlainDateTime.from(effectiveFromLocal);
  const changedRecordRefs = [];
  const revised = records.map((record) => {
    const isFuture = Temporal.PlainDateTime.compare(
      Temporal.PlainDateTime.from(record.nominalLocal),
      effectiveFrom
    ) >= 0;
    if (record.consolidated || !isFuture) {
      return record;
    }

    changedRecordRefs.push(record.recordRef);
    return {
      ...record,
      instant: Temporal.Instant.from(`${record.nominalLocal}${revisedOffset}`).toString({
        smallestUnit: "second"
      }),
      offset: revisedOffset,
      ruleBaseId: newRuleBaseId,
      reexpanded: true
    };
  });

  return { records: revised, changedRecordRefs };
}
