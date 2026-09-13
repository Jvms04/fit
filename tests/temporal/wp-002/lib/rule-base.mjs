import { Temporal } from "@js-temporal/polyfill";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import moment from "moment-timezone";

const require = createRequire(import.meta.url);
const BUNDLE_PATH = require.resolve("moment-timezone/data/packed/latest.json");
const PACKAGE_PATH = require.resolve("moment-timezone/package.json");
const CORPUS_URL = new URL("../fixtures/node24-vectors.json", import.meta.url);

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

export async function loadRuleBase() {
  const [bundleBytes, packageBytes] = await Promise.all([
    readFile(BUNDLE_PATH),
    readFile(PACKAGE_PATH)
  ]);
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  const packageMetadata = JSON.parse(packageBytes.toString("utf8"));
  const bundleSha256 = createHash("sha256").update(bundleBytes).digest("hex");

  if (packageMetadata.version !== "0.6.3" || bundle.version !== "2026c") {
    throw new Error(
      `unexpected temporal rule-base: moment-timezone ${packageMetadata.version}, TZDB ${bundle.version}`
    );
  }

  moment.tz.load(bundle);
  const ruleBaseId = `iana-${bundle.version}+moment-timezone-${packageMetadata.version}+sha256:${bundleSha256}`;

  return {
    packageVersion: packageMetadata.version,
    tzdbVersion: bundle.version,
    bundlePath: BUNDLE_PATH,
    bundleSizeBytes: bundleBytes.length,
    bundleSha256,
    ruleBaseId,
    resolveLocal({ local, zone: zoneName }) {
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
  };
}

export async function runCorpus() {
  const [ruleBase, corpusBytes] = await Promise.all([
    loadRuleBase(),
    readFile(CORPUS_URL)
  ]);
  const corpus = JSON.parse(corpusBytes.toString("utf8"));
  const vectors = corpus.vectors.map(({ id, input, expected }) => {
    const actual = ruleBase.resolveLocal(input);
    const comparable = {
      classification: actual.classification,
      requestedLocal: actual.requestedLocal,
      resolvedLocal: actual.resolvedLocal,
      instant: actual.instant,
      offset: actual.offset
    };
    return {
      id,
      input,
      expected,
      actual: comparable,
      matchesExpected: JSON.stringify(comparable) === JSON.stringify(expected)
    };
  });

  return {
    corpusSchemaVersion: corpus.schemaVersion,
    ruleBaseId: ruleBase.ruleBaseId,
    networkRequired: false,
    vectors
  };
}
