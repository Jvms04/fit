#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RULE_BASE_PATH = require.resolve("moment-timezone/data/packed/latest.json");
const CORPUS_URL = new URL(
  "../../../temporal/wp-002/fixtures/node24-vectors.json",
  import.meta.url
);
const DEFAULT_OUTPUT_URL = new URL("../assets/val006/", import.meta.url);

const EXPECTED_RULE_BASE_SHA256 =
  "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
const EXPECTED_CORPUS_SHA256 =
  "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function prepareHermesAssets(
  outputDirectory = fileURLToPath(DEFAULT_OUTPUT_URL)
) {
  const [ruleBaseBytes, corpusBytes] = await Promise.all([
    readFile(RULE_BASE_PATH),
    readFile(CORPUS_URL)
  ]);
  const ruleBaseSha256 = sha256(ruleBaseBytes);
  const corpusSha256 = sha256(corpusBytes);
  if (ruleBaseSha256 !== EXPECTED_RULE_BASE_SHA256) {
    throw new Error(
      `locked IANA rule-base hash mismatch: expected ${EXPECTED_RULE_BASE_SHA256}, received ${ruleBaseSha256}`
    );
  }
  if (corpusSha256 !== EXPECTED_CORPUS_SHA256) {
    throw new Error(
      `versioned VAL-006 corpus hash mismatch: expected ${EXPECTED_CORPUS_SHA256}, received ${corpusSha256}`
    );
  }
  const ruleBase = JSON.parse(ruleBaseBytes.toString("utf8"));
  const corpus = JSON.parse(corpusBytes.toString("utf8"));
  if (
    ruleBase.version !== "2026c" ||
    corpus.ruleBase?.packageVersion !== "0.6.3" ||
    corpus.ruleBase?.tzdbVersion !== "2026c" ||
    corpus.vectors?.length !== 5
  ) {
    throw new Error("VAL-006 Hermes assets do not match the approved Node parcel metadata");
  }

  const destination = resolve(outputDirectory);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    writeFile(resolve(destination, "iana-2026c.tzdb"), ruleBaseBytes),
    writeFile(resolve(destination, "node24-vectors.corpus"), corpusBytes)
  ]);
  return {
    outputDirectory: destination,
    ruleBase: { sha256: ruleBaseSha256, sizeBytes: ruleBaseBytes.length },
    corpus: { sha256: corpusSha256, sizeBytes: corpusBytes.length, vectors: corpus.vectors.length }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  prepareHermesAssets(process.argv[2])
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
