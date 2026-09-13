const REASON_CATEGORIES = new Map([
  [0, "UNKNOWN"],
  [1, "EXIT_SELF"],
  [2, "SIGNALED"],
  [3, "LOW_MEMORY"],
  [4, "JAVA_CRASH"],
  [5, "NATIVE_CRASH"],
  [6, "ANR"],
  [7, "INITIALIZATION_FAILURE"],
  [8, "PERMISSION_CHANGE"],
  [9, "EXCESSIVE_RESOURCE_USAGE"],
  [10, "PROTOCOL_FORCE_STOP"],
  [11, "USER_STOPPED"],
  [12, "DEPENDENCY_DIED"],
  [13, "OTHER"],
  [14, "FREEZER"],
  [15, "PACKAGE_STATE_CHANGE"],
  [16, "PACKAGE_UPDATED"],
  [17, "MEMORY_LIMITER"],
  [18, "ANOMALY"]
]);

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function identity(record) {
  return [record.timestamp, record.pid, record.process, record.reason, record.status].join("|");
}

function parseLineFields(line) {
  const matches = [...String(line).matchAll(/(?:^|\s+)([A-Za-z][A-Za-z0-9]*)=/gu)];
  const fields = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const valueStart = match.index + match[0].length;
    const valueEnd = matches[index + 1]?.index ?? line.length;
    fields.push([match[1], line.slice(valueStart, valueEnd).trim()]);
  }
  return fields;
}

export function parseProcessExitInfo(raw, packageName) {
  const records = [];
  const blocks = String(raw).split(/(?=ApplicationExitInfo #\d+:)/u);

  for (const block of blocks) {
    if (!/^ApplicationExitInfo #\d+:/u.test(block.trimStart())) {
      continue;
    }
    const values = new Map();
    for (const line of block.split(/\r?\n/u).slice(1)) {
      for (const [name, value] of parseLineFields(line)) {
        values.set(name, value);
      }
    }
    const processName = values.get("process") ?? "";
    if (processName !== packageName && !processName.startsWith(`${packageName}:`)) {
      continue;
    }
    const reasonMatch = (values.get("reason") ?? "").match(/^(\d+)/u);
    const reason = reasonMatch ? parseInteger(reasonMatch[1]) : null;
    const record = {
      timestamp: values.get("timestamp") ?? null,
      pid: parseInteger(values.get("pid")),
      process: processName,
      reason,
      category: REASON_CATEGORIES.get(reason) ?? "UNRECOGNIZED",
      status: parseInteger(values.get("status")),
      description: values.get("description") ?? null,
      raw: block.trimEnd()
    };
    record.identity = identity(record);
    records.push(record);
  }
  return records;
}

export function classifyNewProcessExits(beforeRaw, afterRaw, packageName) {
  const baseline = parseProcessExitInfo(beforeRaw, packageName);
  const baselineIds = new Set(baseline.map(identity));
  const observed = parseProcessExitInfo(afterRaw, packageName);
  const newRecords = observed.filter((record) => !baselineIds.has(identity(record)));
  const expectedProtocolRecords = newRecords.filter((record) => record.reason === 10);
  const abnormalRecords = newRecords.filter((record) => record.reason !== 10);

  return { baseline, observed, newRecords, expectedProtocolRecords, abnormalRecords };
}
