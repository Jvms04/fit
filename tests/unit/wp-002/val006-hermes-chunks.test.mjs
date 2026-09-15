import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HERMES_CHUNK_MARKER,
  encodeHermesReportChunks,
  reconstructHermesReport
} from "../../native/wp-002-mobile-harness/val006/hermes-chunks.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function encode(report, executionId = "a".repeat(32)) {
  return encodeHermesReportChunks(report, { executionId, sha256 });
}

function lines(chunks) {
  return chunks.map((chunk) => `09-16 ReactNativeJS: I ${HERMES_CHUNK_MARKER} ${chunk}`);
}

test("reconstructs a report larger than one logcat entry from ordered chunks", async () => {
  const report = {
    schemaVersion: 1,
    validation: "VAL-006",
    vectors: Array.from({ length: 5 }, (_, index) => ({
      id: `vector-${index + 1}`,
      detail: "x".repeat(2_000)
    }))
  };
  const chunks = await encode(report);
  const serialized = JSON.stringify(report);

  assert.ok(Buffer.byteLength(serialized, "utf8") > 4_096);
  assert.ok(chunks.length > 1);
  assert.ok(lines(chunks).every((line) => Buffer.byteLength(line, "utf8") < 2_048));

  const reconstructed = reconstructHermesReport(lines(chunks).join("\n"), { sha256 });

  assert.equal(reconstructed.payloadText, serialized);
  assert.deepEqual(JSON.parse(reconstructed.payloadText), report);
  assert.equal(reconstructed.total, chunks.length);
});

test("rejects an incomplete chunk sequence", async () => {
  const chunks = await encode({ value: "missing chunk", padding: "x".repeat(1_000) });

  assert.throws(
    () => reconstructHermesReport(lines(chunks.slice(0, -1)).join("\n"), { sha256 }),
    /incomplete|missing/i
  );
});

test("rejects duplicate, out-of-order, mixed-execution and invalid-integrity chunks", async () => {
  const first = await encode({ value: "first", padding: "x".repeat(2_000) }, "a".repeat(32));
  const second = await encode({ value: "second", padding: "y".repeat(2_000) }, "b".repeat(32));

  assert.throws(
    () => reconstructHermesReport(lines([first[0], first[0], ...first.slice(1)]).join("\n"), { sha256 }),
    /duplicate/i
  );
  assert.throws(
    () => reconstructHermesReport(lines([first[1], first[0], ...first.slice(2)]).join("\n"), { sha256 }),
    /order/i
  );
  assert.throws(
    () => reconstructHermesReport(lines([first[0], second[0], ...first.slice(1)]).join("\n"), { sha256 }),
    /execution|mixed/i
  );

  const corrupted = JSON.parse(first[0]);
  corrupted.data = `${corrupted.data.slice(0, -1)}${corrupted.data.endsWith("A") ? "B" : "A"}`;
  assert.throws(
    () => reconstructHermesReport(lines([JSON.stringify(corrupted), ...first.slice(1)]).join("\n"), { sha256 }),
    /integrity|hash/i
  );
});


test("keeps an emission-error line outside the chunk protocol", async () => {
  const appSource = readFileSync(
    new URL("../../native/wp-002-mobile-harness/App.tsx", import.meta.url),
    "utf8"
  );
  const errorLine = "[FIT_WP002_VAL006_HERMES_EMIT_ERROR] {\"error\":\"digest failed\"}";

  assert.match(appSource, /\[FIT_WP002_VAL006_HERMES_EMIT_ERROR\]/u);
  assert.doesNotMatch(appSource, /\[FIT_WP002_VAL006_HERMES_CHUNK\][^\r\n]*unknown chunk emission error/u);
  assert.throws(
    () => reconstructHermesReport(errorLine, { sha256 }),
    (error) => error.code === "MISSING"
  );
});
