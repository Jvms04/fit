#!/usr/bin/env node

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const EXPECTED_RULE_BASE_SHA256 =
  "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
const EXPECTED_CORPUS_SHA256 =
  "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";
const EXPECTED_RULE_BASE_SIZE = 715_527;
const EXPECTED_CORPUS_SIZE = 2_060;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function findEocd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("APK ZIP end-of-central-directory record not found");
}

function readZipEntries(bytes) {
  const eocd = findEocd(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  let centralOffset = bytes.readUInt32LE(eocd + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error(`invalid APK central-directory entry ${index}`);
    }
    const flags = bytes.readUInt16LE(centralOffset + 8);
    const compression = bytes.readUInt16LE(centralOffset + 10);
    const compressedSize = bytes.readUInt32LE(centralOffset + 20);
    const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
    const nameLength = bytes.readUInt16LE(centralOffset + 28);
    const extraLength = bytes.readUInt16LE(centralOffset + 30);
    const commentLength = bytes.readUInt16LE(centralOffset + 32);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const name = bytes
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString("utf8");
    entries.push({
      name,
      flags,
      compression,
      compressedSize,
      uncompressedSize,
      localOffset
    });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryBytes(apkBytes, entry) {
  if ((entry.flags & 0x1) !== 0) {
    throw new Error(`encrypted APK entry cannot be verified: ${entry.name}`);
  }
  if (apkBytes.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new Error(`invalid local APK entry: ${entry.name}`);
  }
  const nameLength = apkBytes.readUInt16LE(entry.localOffset + 26);
  const extraLength = apkBytes.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = apkBytes.subarray(start, start + entry.compressedSize);
  if (entry.compression === 0) {
    return compressed;
  }
  if (entry.compression === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`unsupported APK compression method ${entry.compression}: ${entry.name}`);
}

function findHashedEntry(apkBytes, entries, { expectedHash, expectedSize, label }) {
  for (const entry of entries.filter(({ uncompressedSize }) => uncompressedSize === expectedSize)) {
    const value = entryBytes(apkBytes, entry);
    if (value.length === expectedSize && sha256(value) === expectedHash) {
      return { entry, value };
    }
  }
  throw new Error(`${label} bytes are absent or divergent in APK`);
}

function requireCondition(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

export async function createHermesAndroidProvenance({
  apkPath,
  apkMetadata,
  appConfig,
  expectedHeadSha
}) {
  const apkBytes = await readFile(apkPath);
  const actualApkSha256 = sha256(apkBytes);
  requireCondition(/^[0-9a-f]{40}$/.test(expectedHeadSha), "expected head must be a full SHA");
  requireCondition(apkMetadata?.source?.headSha === expectedHeadSha, "APK metadata head mismatch");
  requireCondition(apkMetadata?.apk?.sha256 === actualApkSha256, "APK metadata hash mismatch");
  requireCondition(apkMetadata?.apk?.sizeBytes === apkBytes.length, "APK metadata size mismatch");
  requireCondition(
    apkMetadata?.apk?.packageName === "com.fit.wp002probe" &&
      appConfig?.expo?.android?.package === "com.fit.wp002probe",
    "APK package mismatch"
  );
  requireCondition(apkMetadata?.apk?.debuggable === false, "Hermes gate requires a release APK");
  requireCondition(apkMetadata?.build?.variant === "release", "Hermes gate requires release variant");
  requireCondition(
    apkMetadata?.build?.architecture === "arm64-v8a",
    "Hermes gate requires arm64-v8a artifact"
  );
  requireCondition(appConfig?.expo?.jsEngine === "hermes", "app configuration does not select Hermes");

  const entries = readZipEntries(apkBytes);
  const hermesLibrary = entries.find(({ name }) => name === "lib/arm64-v8a/libhermes.so");
  requireCondition(hermesLibrary, "Hermes arm64 native library is absent from APK");
  const ruleBaseAsset = findHashedEntry(apkBytes, entries, {
    expectedHash: EXPECTED_RULE_BASE_SHA256,
    expectedSize: EXPECTED_RULE_BASE_SIZE,
    label: "IANA 2026c rule-base"
  });
  const corpusAsset = findHashedEntry(apkBytes, entries, {
    expectedHash: EXPECTED_CORPUS_SHA256,
    expectedSize: EXPECTED_CORPUS_SIZE,
    label: "VAL-006 Node corpus"
  });
  const ruleBase = JSON.parse(ruleBaseAsset.value.toString("utf8"));
  const corpus = JSON.parse(corpusAsset.value.toString("utf8"));
  requireCondition(ruleBase.version === "2026c", "embedded rule-base is not TZDB 2026c");
  requireCondition(
    corpus.schemaVersion === 1 && corpus.vectors?.length === 5,
    "embedded corpus is not the approved five-vector corpus"
  );

  return {
    schemaVersion: 1,
    evidenceType: "WP-002-VAL006-HERMES-ANDROID-PREPARATION",
    generatedBy: "github-actions",
    source: {
      headSha: expectedHeadSha,
      apkProvenanceRunId: apkMetadata.source.runId ?? null
    },
    apk: {
      fileName: basename(apkPath),
      sha256: actualApkSha256,
      sizeBytes: apkBytes.length,
      packageName: apkMetadata.apk.packageName,
      variant: apkMetadata.build.variant,
      architecture: apkMetadata.build.architecture
    },
    engine: {
      configured: "hermes",
      arm64NativeLibraryPresent: true,
      nativeLibraryEntry: hermesLibrary.name,
      runtimeProof: "PENDING_PHYSICAL_EXECUTION"
    },
    ruleBase: {
      tzdbVersion: ruleBase.version,
      momentTimezoneVersion: corpus.ruleBase.packageVersion,
      sha256: EXPECTED_RULE_BASE_SHA256,
      apkEntry: ruleBaseAsset.entry.name,
      bytesVerifiedInApk: true
    },
    corpus: {
      schemaVersion: corpus.schemaVersion,
      vectorCount: corpus.vectors.length,
      sha256: EXPECTED_CORPUS_SHA256,
      apkEntry: corpusAsset.entry.name,
      bytesVerifiedInApk: true
    },
    executionStatus: "NOT-EXECUTED",
    physicalDeviceGateRequired: true,
    osTzdbDivergence: "NOT-EXECUTED",
    hermesIos: "BLOCKED",
    canonicalPromotion: false,
    fallbackActivated: false
  };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near '${key ?? "end"}'`);
    }
    values.set(key.slice(2), value);
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const apkPath = args.get("apk");
  const metadataPath = args.get("apk-metadata");
  const appConfigPath = args.get("app-config");
  const outputPath = args.get("output");
  const expectedHeadSha = process.env.WP002_SOURCE_HEAD;
  requireCondition(apkPath && metadataPath && appConfigPath && outputPath, "all paths are required");
  const [apkMetadata, appConfig] = await Promise.all([
    readFile(metadataPath, "utf8").then(JSON.parse),
    readFile(appConfigPath, "utf8").then(JSON.parse)
  ]);
  const report = await createHermesAndroidProvenance({
    apkPath,
    apkMetadata,
    appConfig,
    expectedHeadSha
  });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
