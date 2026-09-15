export const HERMES_CHUNK_MARKER = "[FIT_WP002_VAL006_HERMES_CHUNK]";
export const HERMES_CHUNK_DATA_BYTES = 512;

const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const EXECUTION_ID = /^[0-9a-f]{32}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function protocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function utf8Encode(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.codePointAt(index);
    if (codePoint > 0xffff) index += 1;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes) {
  let value = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    let codePoint;
    let width;
    if (first <= 0x7f) {
      codePoint = first;
      width = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      width = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      width = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      width = 4;
    } else {
      throw protocolError("INVALID_UTF8", "Hermes payload is not valid UTF-8");
    }

    if (index + width > bytes.length) {
      throw protocolError("INVALID_UTF8", "Hermes payload has a truncated UTF-8 sequence");
    }
    for (let offset = 1; offset < width; offset += 1) {
      const continuation = bytes[index + offset];
      if ((continuation & 0xc0) !== 0x80) {
        throw protocolError("INVALID_UTF8", "Hermes payload has an invalid UTF-8 continuation");
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }
    if (
      (width === 2 && codePoint < 0x80) ||
      (width === 3 && codePoint < 0x800) ||
      (width === 4 && codePoint < 0x10000) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint > 0x10ffff
    ) {
      throw protocolError("INVALID_UTF8", "Hermes payload has a non-canonical UTF-8 sequence");
    }
    value += String.fromCodePoint(codePoint);
    index += width;
  }
  return value;
}

function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? "=" : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? "=" : alphabet[third & 0x3f];
  }
  return result;
}

function base64ToBytes(value) {
  if (!BASE64.test(value) || value.length % 4 !== 0) {
    throw protocolError("INVALID_BASE64", "Hermes chunk data is not canonical base64");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let output = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = alphabet.indexOf(value[index]);
    const second = alphabet.indexOf(value[index + 1]);
    const third = value[index + 2] === "=" ? 0 : alphabet.indexOf(value[index + 2]);
    const fourth = value[index + 3] === "=" ? 0 : alphabet.indexOf(value[index + 3]);
    bytes[output] = (first << 2) | (second >> 4);
    output += 1;
    if (output < bytes.length) bytes[output] = ((second & 0x0f) << 4) | (third >> 2);
    output += 1;
    if (output < bytes.length) bytes[output] = ((third & 0x03) << 6) | fourth;
    output += 1;
  }
  if (bytesToBase64(bytes) !== value) {
    throw protocolError("INVALID_BASE64", "Hermes chunk data is not canonical base64");
  }
  return bytes;
}

function requireSha256(sha256) {
  if (typeof sha256 !== "function") {
    throw new TypeError("sha256 callback is required for Hermes chunk integrity");
  }
}

export async function encodeHermesReportChunks(report, { executionId, sha256 }) {
  requireSha256(sha256);
  if (!EXECUTION_ID.test(executionId)) {
    throw new TypeError("executionId must be a 128-bit lowercase hexadecimal identifier");
  }
  const payloadText = typeof report === "string" ? report : JSON.stringify(report);
  if (typeof payloadText !== "string") {
    throw new TypeError("Hermes report must be JSON-serializable");
  }
  const payloadBytes = utf8Encode(payloadText);
  const payloadSha256 = await sha256(payloadBytes);
  if (!HEX_SHA256.test(payloadSha256)) {
    throw new TypeError("sha256 callback must return a lowercase SHA-256 hex digest");
  }

  const total = Math.max(1, Math.ceil(payloadBytes.length / HERMES_CHUNK_DATA_BYTES));
  const chunks = [];
  for (let index = 0; index < total; index += 1) {
    const start = index * HERMES_CHUNK_DATA_BYTES;
    const dataBytes = payloadBytes.slice(start, start + HERMES_CHUNK_DATA_BYTES);
    const data = bytesToBase64(dataBytes);
    const chunkSha256 = await sha256(dataBytes);
    if (!HEX_SHA256.test(chunkSha256)) {
      throw new TypeError("sha256 callback must return a lowercase SHA-256 hex digest");
    }
    chunks.push(JSON.stringify({
      schemaVersion: 1,
      protocol: "VAL006_HERMES_LOGCAT_CHUNK",
      executionId,
      index,
      total,
      payloadSha256,
      chunkSha256,
      data
    }));
  }
  return chunks;
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw protocolError("INVALID_CHUNK", "Hermes chunk is not an object");
  }
  if (envelope.schemaVersion !== 1 || envelope.protocol !== "VAL006_HERMES_LOGCAT_CHUNK") {
    throw protocolError("INVALID_CHUNK", "Hermes chunk protocol is unsupported");
  }
  if (!EXECUTION_ID.test(envelope.executionId)) {
    throw protocolError("INVALID_CHUNK", "Hermes chunk execution identifier is invalid");
  }
  if (!Number.isInteger(envelope.index) || envelope.index < 0) {
    throw protocolError("INVALID_CHUNK", "Hermes chunk index is invalid");
  }
  if (!Number.isInteger(envelope.total) || envelope.total < 1 || envelope.total > 10_000) {
    throw protocolError("INVALID_CHUNK", "Hermes chunk total is invalid");
  }
  if (envelope.index >= envelope.total) {
    throw protocolError("INVALID_CHUNK", "Hermes chunk index exceeds total");
  }
  if (!HEX_SHA256.test(envelope.payloadSha256) || !HEX_SHA256.test(envelope.chunkSha256)) {
    throw protocolError("INVALID_INTEGRITY", "Hermes chunk integrity fields are invalid");
  }
  if (typeof envelope.data !== "string") {
    throw protocolError("INVALID_CHUNK", "Hermes chunk data is not a string");
  }
  return envelope;
}

export function reconstructHermesReport(raw, { sha256 }) {
  requireSha256(sha256);
  const chunkLines = String(raw)
    .split(/\r?\n/u)
    .filter((line) => line.includes(HERMES_CHUNK_MARKER));
  if (chunkLines.length === 0) {
    throw protocolError("MISSING", "Hermes chunk sequence was not observed");
  }

  let executionId = null;
  let total = null;
  let payloadSha256 = null;
  const seen = new Set();
  const payloadParts = [];

  for (const line of chunkLines) {
    const start = line.indexOf(HERMES_CHUNK_MARKER) + HERMES_CHUNK_MARKER.length;
    const encoded = line.slice(start).trim();
    let envelope;
    try {
      envelope = JSON.parse(encoded);
    } catch (error) {
      throw protocolError("INVALID_CHUNK", `Hermes chunk JSON is invalid: ${error.message}`);
    }
    validateEnvelope(envelope);

    if (executionId === null) executionId = envelope.executionId;
    if (envelope.executionId !== executionId) {
      throw protocolError("MIXED_EXECUTION", "Hermes chunks belong to different executions");
    }
    if (total === null) total = envelope.total;
    if (envelope.total !== total) {
      throw protocolError("INCONSISTENT_TOTAL", "Hermes chunks disagree on total");
    }
    if (payloadSha256 === null) payloadSha256 = envelope.payloadSha256;
    if (envelope.payloadSha256 !== payloadSha256) {
      throw protocolError("INVALID_INTEGRITY", "Hermes chunks disagree on payload integrity");
    }
    if (seen.has(envelope.index)) {
      throw protocolError("DUPLICATE", `Hermes chunk index ${envelope.index} is duplicated`);
    }
    if (envelope.index !== payloadParts.length) {
      throw protocolError("OUT_OF_ORDER", "Hermes chunks are not in strict index order");
    }

    const dataBytes = base64ToBytes(envelope.data);
    if (sha256(dataBytes) !== envelope.chunkSha256) {
      throw protocolError("INVALID_INTEGRITY", `Hermes chunk ${envelope.index} failed integrity validation`);
    }
    seen.add(envelope.index);
    payloadParts.push(dataBytes);
  }

  if (payloadParts.length !== total) {
    throw protocolError(
      "INCOMPLETE",
      `Hermes chunk sequence is incomplete: observed ${payloadParts.length} of ${total}`
    );
  }

  const payloadBytes = new Uint8Array(payloadParts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of payloadParts) {
    payloadBytes.set(part, offset);
    offset += part.length;
  }
  if (sha256(payloadBytes) !== payloadSha256) {
    throw protocolError("INVALID_INTEGRITY", "Hermes payload failed integrity validation");
  }

  return {
    executionId,
    total,
    payloadSha256,
    payloadText: utf8Decode(payloadBytes)
  };
}
