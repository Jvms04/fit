import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyNewProcessExits,
  parseProcessExitInfo
} from "../../performance/wp-002/lib/process-exit.mjs";

const physicalS23Fixture = readFileSync(
  new URL("../../fixtures/wp-002/application-exit-info-s23.txt", import.meta.url),
  "utf8"
);

function exitRecord({ index, timestamp, reason, label, status = 0, process = "com.fit.wp002probe" }) {
  return [
    `ApplicationExitInfo #${index}:`,
    `  timestamp=${timestamp}`,
    `  pid=${4000 + index}`,
    "  realUid=10345",
    "  packageUid=10345",
    "  definingUid=10345",
    "  user=0",
    `  process=${process}`,
    `  reason=${reason} (${label})`,
    `  status=${status}`,
    "  importance=100",
    "  pss=110000kB",
    "  rss=190000kB",
    `  description=${label}`
  ].join("\n");
}

test("attributes Java, native, ANR, signal and initialization exits to the probe", () => {
  const raw = [
    exitRecord({ index: 0, timestamp: "2026-09-10 10:00:05.000", reason: 4, label: "crash" }),
    exitRecord({ index: 1, timestamp: "2026-09-10 10:00:04.000", reason: 5, label: "native crash" }),
    exitRecord({ index: 2, timestamp: "2026-09-10 10:00:03.000", reason: 6, label: "anr" }),
    exitRecord({ index: 3, timestamp: "2026-09-10 10:00:02.000", reason: 2, label: "signaled", status: 11 }),
    exitRecord({ index: 4, timestamp: "2026-09-10 10:00:01.000", reason: 7, label: "initialization failure" })
  ].join("\n");

  const result = classifyNewProcessExits("", raw, "com.fit.wp002probe");

  assert.equal(result.newRecords.length, 5);
  assert.deepEqual(result.abnormalRecords.map((record) => record.reason), [4, 5, 6, 2, 7]);
  assert.deepEqual(result.abnormalRecords.map((record) => record.category), [
    "JAVA_CRASH",
    "NATIVE_CRASH",
    "ANR",
    "SIGNALED",
    "INITIALIZATION_FAILURE"
  ]);
});

test("treats only protocol force-stop exits as expected and ignores baseline history", () => {
  const historical = exitRecord({
    index: 0,
    timestamp: "2026-09-10 09:00:00.000",
    reason: 4,
    label: "old crash"
  });
  const expectedForceStop = exitRecord({
    index: 0,
    timestamp: "2026-09-10 10:00:00.000",
    reason: 10,
    label: "user request"
  });

  const result = classifyNewProcessExits(historical, `${expectedForceStop}\n${historical}`, "com.fit.wp002probe");

  assert.equal(result.newRecords.length, 1);
  assert.equal(result.expectedProtocolRecords.length, 1);
  assert.equal(result.abnormalRecords.length, 0);
});

test("parses only the requested package process family", () => {
  const raw = [
    exitRecord({ index: 0, timestamp: "2026-09-10 10:00:00.000", reason: 4, label: "probe" }),
    exitRecord({
      index: 1,
      timestamp: "2026-09-10 10:00:00.500",
      reason: 5,
      label: "probe worker",
      process: "com.fit.wp002probe:worker"
    }),
    exitRecord({
      index: 2,
      timestamp: "2026-09-10 10:00:01.000",
      reason: 4,
      label: "other",
      process: "com.other.application"
    })
  ].join("\n");

  assert.deepEqual(
    parseProcessExitInfo(raw, "com.fit.wp002probe").map((record) => record.process),
    ["com.fit.wp002probe", "com.fit.wp002probe:worker"]
  );
});

test("parses the physical S23 multi-field line and recognizes protocol force-stop", () => {
  const result = classifyNewProcessExits("", physicalS23Fixture, "com.fit.wp002probe");

  assert.equal(result.newRecords.length, 1);
  assert.equal(result.expectedProtocolRecords.length, 1);
  assert.equal(result.abnormalRecords.length, 0);
  assert.deepEqual(
    {
      process: result.expectedProtocolRecords[0].process,
      reason: result.expectedProtocolRecords[0].reason,
      status: result.expectedProtocolRecords[0].status,
      category: result.expectedProtocolRecords[0].category
    },
    {
      process: "com.fit.wp002probe",
      reason: 10,
      status: 0,
      category: "PROTOCOL_FORCE_STOP"
    }
  );
});
