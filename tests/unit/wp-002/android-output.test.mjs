import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAmStartOutput,
  parseDeviceList,
  parseTotalPssKb
} from "../../performance/wp-002/lib/android-output.mjs";

test("parses an authorized physical device without losing its selector", () => {
  const output = [
    "List of devices attached",
    "R5CW000000A device product:dm3q model:SM_S911B device:dm3q transport_id:4",
    ""
  ].join("\n");

  assert.deepEqual(parseDeviceList(output), [{
    serial: "R5CW000000A",
    state: "device",
    product: "dm3q",
    model: "SM_S911B",
    device: "dm3q",
    transportId: "4"
  }]);
});

test("retains unauthorized devices as unavailable evidence", () => {
  const output = "List of devices attached\nR5CW000000A unauthorized usb:1-1\n";
  assert.deepEqual(parseDeviceList(output), [{ serial: "R5CW000000A", state: "unauthorized" }]);
});

test("parses Android activity timing fields as raw milliseconds", () => {
  const output = [
    "Status: ok",
    "LaunchState: COLD",
    "Activity: com.fit.wp002probe/.MainActivity",
    "ThisTime: 482",
    "TotalTime: 482",
    "WaitTime: 490",
    "Complete"
  ].join("\n");

  assert.deepEqual(parseAmStartOutput(output), {
    status: "ok",
    launchState: "COLD",
    activity: "com.fit.wp002probe/.MainActivity",
    thisTimeMs: 482,
    totalTimeMs: 482,
    waitTimeMs: 490,
    complete: true,
    raw: output
  });
});

test("parses total PSS from dumpsys meminfo", () => {
  assert.equal(parseTotalPssKb(" TOTAL PSS:   183420   TOTAL RSS: 240000"), 183420);
  assert.equal(parseTotalPssKb("No process found"), null);
});
