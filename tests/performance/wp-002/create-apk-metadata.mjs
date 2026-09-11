#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";

import { portableInvocation } from "./lib/portable-command.mjs";

function readArguments(argv) {
  const allowed = new Set(["apk", "apkanalyzer", "output"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument sequence near '${key ?? "end"}'`);
    }
    const name = key.slice(2);
    if (!allowed.has(name)) {
      throw new Error(`unsupported argument '--${name}'`);
    }
    values.set(name, value);
  }
  return values;
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function analyze(apkanalyzer, subject, verb, apk) {
  const invocation = portableInvocation(apkanalyzer, [subject, verb, apk]);
  const result = spawnSync(invocation.executable, invocation.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`apkanalyzer ${subject} ${verb} failed: ${(result.stderr ?? "").trim()}`);
  }
  return (result.stdout ?? "").trim();
}

try {
  const args = readArguments(process.argv.slice(2));
  const apkPath = required(args.get("apk"), "--apk");
  const apkanalyzer = required(args.get("apkanalyzer"), "--apkanalyzer");
  const outputPath = required(args.get("output"), "--output");
  const bytes = readFileSync(apkPath);
  const headSha = required(process.env.WP002_SOURCE_HEAD, "WP002_SOURCE_HEAD");
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error("WP002_SOURCE_HEAD must be a full 40-character commit SHA");
  }
  const eventSha = required(process.env.GITHUB_SHA, "GITHUB_SHA");
  if (!/^[0-9a-f]{40}$/i.test(eventSha)) {
    throw new Error("GITHUB_SHA must be a full 40-character commit SHA");
  }

  const metadata = {
    schemaVersion: 1,
    evidenceType: "WP-002-ANDROID-APK-PROVENANCE",
    generatedBy: "github-actions",
    source: {
      repository: required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY"),
      headSha: headSha.toLowerCase(),
      eventSha: eventSha.toLowerCase(),
      workflow: required(process.env.GITHUB_WORKFLOW, "GITHUB_WORKFLOW"),
      runId: required(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID"),
      runAttempt: required(process.env.GITHUB_RUN_ATTEMPT, "GITHUB_RUN_ATTEMPT"),
      job: required(process.env.GITHUB_JOB, "GITHUB_JOB")
    },
    build: {
      variant: "release",
      gradleTask: ":app:assembleRelease",
      architecture: "arm64-v8a",
      artifactName: "wp-002-android-probe"
    },
    apk: {
      fileName: basename(apkPath),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: statSync(apkPath).size,
      packageName: analyze(apkanalyzer, "manifest", "application-id", apkPath),
      versionCode: analyze(apkanalyzer, "manifest", "version-code", apkPath),
      versionName: analyze(apkanalyzer, "manifest", "version-name", apkPath),
      debuggable: analyze(apkanalyzer, "manifest", "debuggable", apkPath) === "true"
    },
    runtimeContract: {
      marker: "[FIT_WP002]",
      expectedSyntheticRowCount: 1000,
      verification: "required from the installed probe during formal-run preflight"
    }
  };

  if (metadata.apk.packageName !== "com.fit.wp002probe" || metadata.apk.debuggable) {
    throw new Error("built APK is not the non-debuggable WP-002 probe package");
  }

  writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
