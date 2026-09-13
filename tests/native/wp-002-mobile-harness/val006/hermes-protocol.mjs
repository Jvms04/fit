import { Temporal } from "@js-temporal/polyfill";
import moment from "moment-timezone";

export const EXPECTED_RULE_BASE_SHA256 =
  "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
export const EXPECTED_CORPUS_SHA256 =
  "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";
export const EXPECTED_RULE_BASE_ID =
  `iana-2026c+moment-timezone-0.6.3+sha256:${EXPECTED_RULE_BASE_SHA256}`;

function decodeAscii(bytes, name) {
  let text = "";
  const chunkSize = 16_384;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, Math.min(start + chunkSize, bytes.length));
    for (const value of chunk) {
      if (value > 0x7f) {
        throw new Error(`${name} contains a non-ASCII byte and cannot be decoded deterministically`);
      }
    }
    text += String.fromCharCode(...chunk);
  }
  return text;
}

function canonicalLocal(value) {
  return Temporal.PlainDateTime.from(value).toString({ smallestUnit: "second" });
}

function possibleInstants(local, zoneName, zone) {
  const plain = Temporal.PlainDateTime.from(local);
  const localEpochMs = Number(plain.toZonedDateTime("UTC").epochMilliseconds);
  const offsets = [...new Set(zone.offsets)];

  return offsets
    .map((minutesWest) => localEpochMs + minutesWest * 60_000)
    .filter((epochMs) => moment.tz(epochMs, zoneName).format("YYYY-MM-DDTHH:mm:ss") === local)
    .sort((left, right) => left - right);
}

function firstValidAfter(local, zoneName, zone) {
  let candidate = Temporal.PlainDateTime.from(local);
  for (let second = 1; second <= 4 * 60 * 60; second += 1) {
    candidate = candidate.add({ seconds: 1 });
    const candidateLocal = candidate.toString({ smallestUnit: "second" });
    const instants = possibleInstants(candidateLocal, zoneName, zone);
    if (instants.length > 0) {
      return { local: candidateLocal, epochMs: instants[0] };
    }
  }
  throw new Error(`no valid local instant found within four hours after ${local} in ${zoneName}`);
}

function toResult({ requestedLocal, resolvedLocal, epochMs, zoneName, classification, ruleBaseId }) {
  const resolved = moment.tz(epochMs, zoneName);
  return {
    classification,
    requestedLocal,
    resolvedLocal,
    zone: zoneName,
    instant: Temporal.Instant.fromEpochMilliseconds(epochMs).toString({ smallestUnit: "second" }),
    offset: resolved.format("Z"),
    ruleBaseId
  };
}

function resolveLocal({ local, zone: zoneName }, ruleBaseId) {
  const requestedLocal = canonicalLocal(local);
  const zone = moment.tz.zone(zoneName);
  if (!zone) {
    throw new Error(`unknown IANA zone '${zoneName}'`);
  }

  const instants = possibleInstants(requestedLocal, zoneName, zone);
  if (instants.length === 0) {
    const next = firstValidAfter(requestedLocal, zoneName, zone);
    return toResult({
      requestedLocal,
      resolvedLocal: next.local,
      epochMs: next.epochMs,
      zoneName,
      classification: "NONEXISTENT_ADJUSTED_TO_NEXT_VALID",
      ruleBaseId
    });
  }

  return toResult({
    requestedLocal,
    resolvedLocal: requestedLocal,
    epochMs: instants[0],
    zoneName,
    classification: instants.length > 1 ? "REPEATED_FIRST_OCCURRENCE" : "EXACT",
    ruleBaseId
  });
}

function requireVerifiedInputs({ runtime, corpusSha256, ruleBaseSha256 }) {
  if (
    runtime?.platform !== "android" ||
    runtime?.engine !== "Hermes" ||
    runtime?.hermesInternalPresent !== true
  ) {
    throw new Error("Hermes runtime proof required before VAL-006 vector comparison");
  }
  if (ruleBaseSha256 !== EXPECTED_RULE_BASE_SHA256) {
    throw new Error(
      `rule-base SHA-256 mismatch: expected ${EXPECTED_RULE_BASE_SHA256}, received ${ruleBaseSha256}`
    );
  }
  if (corpusSha256 !== EXPECTED_CORPUS_SHA256) {
    throw new Error(
      `corpus SHA-256 mismatch: expected ${EXPECTED_CORPUS_SHA256}, received ${corpusSha256}`
    );
  }
}

export function buildHermesAndroidReport({
  runtime,
  corpusBytes,
  corpusSha256,
  ruleBaseBytes,
  ruleBaseSha256
}) {
  requireVerifiedInputs({ runtime, corpusSha256, ruleBaseSha256 });

  const ruleBase = JSON.parse(decodeAscii(ruleBaseBytes, "rule base"));
  const corpus = JSON.parse(decodeAscii(corpusBytes, "corpus"));
  if (ruleBase.version !== "2026c") {
    throw new Error(`unexpected TZDB version '${ruleBase.version}'`);
  }
  if (
    corpus.schemaVersion !== 1 ||
    corpus.ruleBase?.package !== "moment-timezone" ||
    corpus.ruleBase?.packageVersion !== "0.6.3" ||
    corpus.ruleBase?.tzdbVersion !== "2026c" ||
    !Array.isArray(corpus.vectors) ||
    corpus.vectors.length !== 5
  ) {
    throw new Error("corpus metadata does not match the approved Node 24 parcel");
  }

  const ruleBaseId =
    `iana-${ruleBase.version}+moment-timezone-${corpus.ruleBase.packageVersion}` +
    `+sha256:${ruleBaseSha256}`;
  if (ruleBaseId !== EXPECTED_RULE_BASE_ID) {
    throw new Error(`rule_base_id divergence: expected ${EXPECTED_RULE_BASE_ID}, received ${ruleBaseId}`);
  }

  moment.tz.load(ruleBase);
  const vectors = corpus.vectors.map(({ id, input, expected }) => {
    const actualWithRuleBase = resolveLocal(input, ruleBaseId);
    const actual = {
      classification: actualWithRuleBase.classification,
      requestedLocal: actualWithRuleBase.requestedLocal,
      resolvedLocal: actualWithRuleBase.resolvedLocal,
      instant: actualWithRuleBase.instant,
      offset: actualWithRuleBase.offset
    };
    return {
      id,
      input,
      expected,
      actual,
      matchesExpected: JSON.stringify(actual) === JSON.stringify(expected)
    };
  });
  const matched = vectors.filter(({ matchesExpected }) => matchesExpected).length;
  const comparable = matched === vectors.length;

  return {
    schemaVersion: 1,
    wp: "WP-002",
    validation: "VAL-006",
    classification: "VAL006_HERMES_ANDROID_RUNTIME_CANDIDATE",
    runtime: { ...runtime, engineVerified: true },
    dependencies: {
      temporalPolyfill: "0.5.1",
      momentTimezone: "0.6.3",
      tzdb: "2026c"
    },
    ruleBase: {
      id: ruleBaseId,
      bundleSha256: ruleBaseSha256,
      bundleSizeBytes: ruleBaseBytes.length,
      bytesVerifiedAtRuntime: true
    },
    corpus: {
      schemaVersion: corpus.schemaVersion,
      sha256: corpusSha256,
      sizeBytes: corpusBytes.length,
      bytesVerifiedAtRuntime: true
    },
    vectorSummary: { total: vectors.length, matched },
    vectors,
    comparison: {
      reference: "VAL006_NODE24_PARTIAL.json",
      expectedRuleBaseId: EXPECTED_RULE_BASE_ID,
      observedRuleBaseId: ruleBaseId,
      ruleBaseMatch: true,
      fields: ["id", "input", "expected", "actual", "matchesExpected"],
      comparable
    },
    networkRequired: false,
    osTzdbDivergence: "NOT-EXECUTED",
    hermes: { android: "RUNTIME-CANDIDATE", ios: "BLOCKED" },
    canonicalPromotion: false,
    automaticPromotion: false,
    fallbackActivated: false
  };
}
