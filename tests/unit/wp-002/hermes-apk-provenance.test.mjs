import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

const implementation = await import(
  "../../temporal/wp-002/create-hermes-android-provenance.mjs"
).catch(() => ({}));

const RULE_BASE_SHA256 =
  "43f7878a298740ff6acabb9c726c7e5431a94bdca79abad274a6fe6e355bfe81";
const CORPUS_SHA256 =
  "58eb313e1643048b7ac4840e5fa041d025b87d233d325920572951851a0c8141";

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, value, compression = 0] of entries) {
    const nameBytes = Buffer.from(name);
    const bytes = Buffer.from(value);
    const storedBytes = compression === 8 ? deflateRawSync(bytes) : bytes;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(compression, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(storedBytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, storedBytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(compression, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(storedBytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + storedBytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test("APK provenance binds the same head/APK to Hermes and exact VAL-006 assets", async () => {
  assert.equal(
    typeof implementation.createHermesAndroidProvenance,
    "function",
    "createHermesAndroidProvenance must exist"
  );
  const directory = mkdtempSync(join(tmpdir(), "fit-val006-hermes-provenance-"));
  try {
    const ruleBase = readFileSync(
      fileURLToPath(new URL("../../../node_modules/moment-timezone/data/packed/latest.json", import.meta.url))
    );
    const corpus = readFileSync(
      fileURLToPath(new URL("../../temporal/wp-002/fixtures/node24-vectors.json", import.meta.url))
    );
    const apk = storedZip([
      ["lib/arm64-v8a/libhermes.so", "hermes-native-library"],
      ["assets/val006/iana-2026c.tzdb", ruleBase, 8],
      ["assets/val006/node24-vectors.corpus", corpus, 8]
    ]);
    const apkPath = join(directory, "app-release.apk");
    const apkMetadataPath = join(directory, "APK_PROVENANCE.json");
    const appConfigPath = join(directory, "app.json");
    const outputPath = join(directory, "HERMES_ANDROID_PROVENANCE.json");
    const apkSha256 = createHash("sha256").update(apk).digest("hex");
    const head = "a".repeat(40);
    writeFileSync(apkPath, apk);
    const apkMetadata = {
      schemaVersion: 1,
      evidenceType: "WP-002-ANDROID-APK-PROVENANCE",
      source: { headSha: head, runId: "123" },
      build: { variant: "release", architecture: "arm64-v8a" },
      apk: {
        fileName: "app-release.apk",
        sha256: apkSha256,
        sizeBytes: apk.length,
        packageName: "com.fit.wp002probe",
        debuggable: false
      }
    };
    const appConfig = {
      expo: { jsEngine: "hermes", android: { package: "com.fit.wp002probe" } }
    };
    writeFileSync(apkMetadataPath, `${JSON.stringify(apkMetadata)}\n`);
    writeFileSync(appConfigPath, `${JSON.stringify(appConfig)}\n`);

    const report = await implementation.createHermesAndroidProvenance({
      apkPath,
      apkMetadata,
      appConfig,
      expectedHeadSha: head
    });

    assert.equal(report.source.headSha, head);
    assert.equal(report.apk.sha256, apkSha256);
    assert.equal(report.apk.packageName, "com.fit.wp002probe");
    assert.equal(report.engine.configured, "hermes");
    assert.equal(report.engine.arm64NativeLibraryPresent, true);
    assert.equal(report.engine.runtimeProof, "PENDING_PHYSICAL_EXECUTION");
    assert.deepEqual(report.ruleBase, {
      tzdbVersion: "2026c",
      momentTimezoneVersion: "0.6.3",
      sha256: RULE_BASE_SHA256,
      apkEntry: "assets/val006/iana-2026c.tzdb",
      bytesVerifiedInApk: true
    });
    assert.deepEqual(report.corpus, {
      schemaVersion: 1,
      vectorCount: 5,
      sha256: CORPUS_SHA256,
      apkEntry: "assets/val006/node24-vectors.corpus",
      bytesVerifiedInApk: true
    });
    assert.equal(report.executionStatus, "NOT-EXECUTED");
    assert.equal(report.canonicalPromotion, false);

    const cli = spawnSync(process.execPath, [
      fileURLToPath(new URL("../../temporal/wp-002/create-hermes-android-provenance.mjs", import.meta.url)),
      "--apk", apkPath,
      "--apk-metadata", apkMetadataPath,
      "--app-config", appConfigPath,
      "--output", outputPath
    ], {
      encoding: "utf8",
      env: { ...process.env, WP002_SOURCE_HEAD: head }
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), report);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("provenance refuses an APK without Hermes or with divergent embedded bytes", async () => {
  assert.equal(typeof implementation.createHermesAndroidProvenance, "function");
  const directory = mkdtempSync(join(tmpdir(), "fit-val006-hermes-negative-"));
  try {
    const apk = storedZip([
      ["assets/val006/iana-2026c.tzdb", "wrong-rule-base"],
      ["assets/val006/node24-vectors.corpus", "wrong-corpus"]
    ]);
    const apkPath = join(directory, "app-release.apk");
    const apkSha256 = createHash("sha256").update(apk).digest("hex");
    writeFileSync(apkPath, apk);
    await assert.rejects(
      implementation.createHermesAndroidProvenance({
        apkPath,
        expectedHeadSha: "a".repeat(40),
        appConfig: { expo: { jsEngine: "hermes", android: { package: "com.fit.wp002probe" } } },
        apkMetadata: {
          source: { headSha: "a".repeat(40) },
          build: { variant: "release", architecture: "arm64-v8a" },
          apk: {
            sha256: apkSha256,
            sizeBytes: apk.length,
            packageName: "com.fit.wp002probe",
            debuggable: false
          }
        }
      }),
      /Hermes arm64 native library is absent/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
