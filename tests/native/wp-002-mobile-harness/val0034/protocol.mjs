import { createHash } from "node:crypto";

export const VAL003_OPERATIONS = Object.freeze([
  "create-db-wal-shm-canaries",
  "extract-db-wal-shm",
  "wrong-key",
  "rekey",
  "rekey-interruption",
  "restart-recovery",
  "integrity-after-recovery"
]);

export const VAL004_OPERATIONS = Object.freeze([
  "securestore-keystore",
  "csprng",
  "restart-process",
  "screen-lock-sealed-state",
  "biometric-change"
]);

const HEX_40 = /^[0-9a-f]{40}$/i;
const HEX_64 = /^[0-9a-f]{64}$/i;
const CLASSIFICATIONS = new Set([
  "MEASURED",
  "NOT_EXECUTED",
  "BLOCKED",
  "INCONCLUSIVE",
  "DIAGNOSTIC_INVALID"
]);

export function buildVal0034Plan({ apkSha256, sourceHead }) {
  assertHex(apkSha256, HEX_64, "apkSha256");
  assertHex(sourceHead, HEX_40, "sourceHead");

  return {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    sourceHead: sourceHead.toLowerCase(),
    apkSha256: apkSha256.toLowerCase(),
    packageName: "com.fit.wp002probe",
    protocols: ["VAL-003", "VAL-004"],
    val003: {
      operations: [...VAL003_OPERATIONS],
      extraction: ["wp002-probe.db", "wp002-probe.db-wal", "wp002-probe.db-shm"],
      canaries: ["fit-val003-plaintext-canary", "fit-val003-rekey-canary"]
    },
    val004: {
      operations: [...VAL004_OPERATIONS],
      accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
      biometricChange: "DEVICE_ACTION_REQUIRED"
    },
    canonicalPromotion: false,
    fallbackActivated: false
  };
}

export function validateVal0034Report(report) {
  if (!report || typeof report !== "object") throw new TypeError("report must be an object");
  if (report.schemaVersion !== 1) throw new Error("unsupported report schemaVersion");
  if (report.protocol !== "VAL003_004_ANDROID_DISPOSABLE") throw new Error("unexpected protocol");
  assertHex(report.sourceHead, HEX_40, "sourceHead");
  assertHex(report.apkSha256, HEX_64, "apkSha256");

  const operations = new Set(Array.isArray(report.operations) ? report.operations : []);
  for (const operation of [...VAL003_OPERATIONS, ...VAL004_OPERATIONS]) {
    if (!operations.has(operation)) throw new Error(`required operation missing: ${operation}`);
  }

  if (report.accountIsolation !== "NOT_EVALUATED_WITHOUT_AUTH_A_B") {
    throw new Error("VAL-004 account isolation must remain unevaluated without Auth A/B");
  }
  if (report.canonicalPromotion !== false) throw new Error("canonical promotion must remain false");
  if (report.fallbackActivated !== false) throw new Error("fallback must remain inactive");

  if (!Array.isArray(report.samples)) throw new Error("samples must be an array");
  for (const sample of report.samples) {
    if (!sample || typeof sample !== "object" || typeof sample.operation !== "string") {
      throw new Error("sample operation is required");
    }
    if (!CLASSIFICATIONS.has(sample.classification)) {
      throw new Error(`invalid sample classification: ${sample.classification}`);
    }
  }
  return true;
}

export function classifyVal0034Report(report) {
  validateVal0034Report(report);
  return "PARTIAL";
}

export function redactDeviceOutput(value) {
  if (typeof value !== "string") throw new TypeError("device output must be a string");

  return value
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\S+)\s+(device|unauthorized|offline)\b(.*)$/i);
      if (!match) return line;
      const serial = match[1];
      const serialRef = createHash("sha256").update(serial, "utf8").digest("hex").slice(0, 16);
      return `serialRef:${serialRef} ${match[2].toLowerCase()}${match[3]}`;
    })
    .join("\n");
}

function assertHex(value, pattern, name) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${name} must be hexadecimal`);
}
