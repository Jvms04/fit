function camelizeDeviceKey(key) {
  return key === "transport_id"
    ? "transportId"
    : key;
}

export function parseDeviceList(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...metadata] = line.split(/\s+/);
      const device = { serial, state };

      for (const token of metadata) {
        const separator = token.indexOf(":");
        if (separator === -1) {
          continue;
        }
        const key = camelizeDeviceKey(token.slice(0, separator));
        if (["product", "model", "device", "transportId"].includes(key)) {
          device[key] = token.slice(separator + 1);
        }
      }

      return device;
    });
}

export function parseAmStartOutput(output) {
  const fields = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]])
  );

  const milliseconds = (key) => {
    const rawValue = fields[key];
    if (rawValue === undefined || rawValue.trim() === "") {
      return null;
    }
    const value = Number(rawValue);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  return {
    status: fields.Status ?? null,
    launchState: fields.LaunchState ?? null,
    activity: fields.Activity ?? null,
    thisTimeMs: milliseconds("ThisTime"),
    totalTimeMs: milliseconds("TotalTime"),
    waitTimeMs: milliseconds("WaitTime"),
    complete: output.split(/\r?\n/).includes("Complete"),
    raw: output
  };
}

export function parseTotalPssKb(output) {
  const match = output.match(/TOTAL PSS:\s*(\S+)/u);
  if (!match || !/^\d+$/u.test(match[1])) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
