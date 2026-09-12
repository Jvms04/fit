import { Asset } from "expo-asset";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { Platform } from "react-native";

import { buildHermesAndroidReport } from "./hermes-protocol.mjs";

const RULE_BASE_ASSET = require("../assets/val006/iana-2026c.tzdb");
const CORPUS_ASSET = require("../assets/val006/node24-vectors.corpus");

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

async function loadAssetBytes(moduleId: number): Promise<Uint8Array<ArrayBuffer>> {
  const [asset] = await Asset.loadAsync(moduleId);
  if (!asset) {
    throw new Error("versioned VAL-006 asset was not resolved");
  }
  const uri = asset.localUri ?? asset.uri;
  if (!uri.startsWith("file:")) {
    throw new Error("versioned VAL-006 asset is not available offline on the device");
  }
  return new File(uri).bytes();
}

async function digestSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

export async function runHermesAndroidVal006Probe() {
  const hermesInternal = (
    globalThis as typeof globalThis & {
      HermesInternal?: { getRuntimeProperties?: () => Record<string, unknown> };
    }
  ).HermesInternal;
  const [ruleBaseBytes, corpusBytes] = await Promise.all([
    loadAssetBytes(RULE_BASE_ASSET),
    loadAssetBytes(CORPUS_ASSET)
  ]);
  const [ruleBaseSha256, corpusSha256] = await Promise.all([
    digestSha256(ruleBaseBytes),
    digestSha256(corpusBytes)
  ]);

  return buildHermesAndroidReport({
    runtime: {
      engine: hermesInternal ? "Hermes" : "NOT_HERMES",
      hermesInternalPresent: Boolean(hermesInternal),
      properties: hermesInternal?.getRuntimeProperties?.() ?? null,
      platform: Platform.OS
    },
    corpusBytes,
    corpusSha256,
    ruleBaseBytes,
    ruleBaseSha256
  });
}
