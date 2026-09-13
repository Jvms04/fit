import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const generator = fileURLToPath(
  new URL("../../performance/wp-002/create-apk-metadata.mjs", import.meta.url)
);
const fixtureAnalyzer = fileURLToPath(
  new URL("../../fixtures/wp-002/fake-apkanalyzer.mjs", import.meta.url)
);

test("generates CI provenance from the APK bytes and APK manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "fit-wp002-apk-metadata-"));
  const apk = join(directory, "app-release.apk");
  const metadataPath = join(directory, "APK_PROVENANCE.json");
  const analyzer = join(directory, "fake-apkanalyzer.mjs");
  writeFileSync(apk, "authorized-apk-bytes\n");
  writeFileSync(analyzer, readFileSync(fixtureAnalyzer));
  chmodSync(analyzer, 0o644);

  try {
    const result = spawnSync(process.execPath, [
      generator,
      "--apk", apk,
      "--apkanalyzer", analyzer,
      "--output", metadataPath
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        WP002_SOURCE_HEAD: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        GITHUB_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        GITHUB_REPOSITORY: "Jvms04/fit",
        GITHUB_WORKFLOW: "WP-002 G0 harness",
        GITHUB_RUN_ID: "123456",
        GITHUB_RUN_ATTEMPT: "2",
        GITHUB_JOB: "android-probe-build"
      }
    });

    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    assert.deepEqual(metadata.source, {
      repository: "Jvms04/fit",
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      eventSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflow: "WP-002 G0 harness",
      runId: "123456",
      runAttempt: "2",
      job: "android-probe-build"
    });
    assert.deepEqual(metadata.apk, {
      fileName: "app-release.apk",
      sha256: "d70865fbd3ace58b8c21601b6a1ee8df57a5c98f1d82317ec44086d982d2bbbb",
      sizeBytes: 21,
      packageName: "com.fit.wp002probe",
      versionCode: "1",
      versionName: "0.0.0",
      debuggable: false
    });
    assert.deepEqual(metadata.build, {
      variant: "release",
      gradleTask: ":app:assembleRelease",
      architecture: "arm64-v8a",
      artifactName: "wp-002-android-probe"
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
