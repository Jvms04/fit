import { Temporal } from "@js-temporal/polyfill";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const FUTURE_REVISION_URL = new URL("../fixtures/synthetic-future-revision.json", import.meta.url);
const EXPECTED_FUTURE_REVISION_SHA256 = "9f2e71444ea8d2541702843c386032e62f8a5b9f10360440fd9fdfe2a779feaa";

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
