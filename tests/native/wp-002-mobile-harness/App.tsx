import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, View } from "react-native";

import { encodeHermesReportChunks } from "./val006/hermes-chunks.mjs";
import { runHermesAndroidVal006Probe } from "./val006/run-hermes-android";
import { runVal0034MobileProbe } from "./val0034/mobile-protocol";

const PROBE_KEY_REF = "wp002.sqlcipher.key";
const SYNTHETIC_ROW_COUNT = 1_000;
const startedAt = globalThis.performance.now();

type ProbeResult = {
  status: "ready" | "error";
  sqliteVersion?: string;
  cipherVersion?: string;
  rowCount?: number;
  databaseMs?: number;
  readyMs?: number;
  message?: string;
};

function toHex(bytes: Uint8Array | ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function emitHermesReport(report: unknown): Promise<void> {
  const executionId = toHex(await Crypto.getRandomBytesAsync(16));
  const chunks = await encodeHermesReportChunks(report, {
    executionId,
    sha256: async (bytes) => toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes))
  });
  for (const chunk of chunks) {
    console.info(`[FIT_WP002_VAL006_HERMES_CHUNK] ${chunk}`);
  }
}

async function getProbeKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(PROBE_KEY_REF);
  if (existing) {
    return existing;
  }

  const generated = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(PROBE_KEY_REF, generated, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return generated;
}

async function runDatabaseCharacterization(): Promise<ProbeResult> {
  const databaseStartedAt = globalThis.performance.now();
  const key = await getProbeKey();
  const database = await SQLite.openDatabaseAsync("wp002-probe.db");

  await database.execAsync(`PRAGMA key = "x'${key}'";`);
  await database.execAsync("PRAGMA journal_mode = WAL;");
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS probe_items (
      id INTEGER PRIMARY KEY NOT NULL,
      label TEXT NOT NULL
    );
    DELETE FROM probe_items;
    WITH RECURSIVE counter(value) AS (
      SELECT 1
      UNION ALL
      SELECT value + 1 FROM counter WHERE value < ${SYNTHETIC_ROW_COUNT}
    )
    INSERT INTO probe_items(id, label)
    SELECT value, printf('synthetic-row-%06d', value) FROM counter;
  `);

  const sqlite = await database.getFirstAsync<{ sqliteVersion: string }>(
    "SELECT sqlite_version() AS sqliteVersion"
  );
  const cipher = await database.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version"
  );
  const count = await database.getFirstAsync<{ rowCount: number }>(
    "SELECT COUNT(*) AS rowCount FROM probe_items"
  );
  await database.closeAsync();

  const readyMs = globalThis.performance.now() - startedAt;
  return {
    status: "ready",
    sqliteVersion: sqlite?.sqliteVersion ?? "unknown",
    cipherVersion: cipher?.cipher_version ?? "unknown",
    rowCount: count?.rowCount ?? 0,
    databaseMs: globalThis.performance.now() - databaseStartedAt,
    readyMs
  };
}

export default function App() {
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [val0034Mode, setVal0034Mode] = useState<"run" | "rekey-interruption" | "recovery" | null>(null);
  const [linkResolved, setLinkResolved] = useState(false);
  const items = useMemo(
    () => Array.from({ length: SYNTHETIC_ROW_COUNT }, (_, index) => `synthetic-row-${index + 1}`),
    []
  );

  useEffect(() => {
    let mounted = true;
    const updateFromUrl = (url: string | null) => {
      if (!url) return;
      try {
        const prefix = "fit-wp002://";
        if (!url.startsWith(prefix)) return;
        const operation = (url.slice(prefix.length).split(/[?#]/u)[0] ?? "").replace(/^\/+/, "");
        if (operation === "val0034/rekey-interruption") {
          setVal0034Mode("rekey-interruption");
        } else if (operation === "val0034/recovery") {
          setVal0034Mode("recovery");
        } else if (operation === "val0034/run") {
          setVal0034Mode("run");
        }
      } catch {
        // A malformed deep link leaves the normal probe untouched.
      }
    };
    Linking.getInitialURL()
      .then((url) => {
        if (mounted) updateFromUrl(url);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLinkResolved(true);
      });
    const linkSubscription = Linking.addEventListener("url", ({ url }) => updateFromUrl(url));
    return () => {
      mounted = false;
      linkSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!val0034Mode) return;
    runVal0034MobileProbe(val0034Mode)
      .then((report) => console.info(`[FIT_VAL0034] ${JSON.stringify(report)}`))
      .catch((error: unknown) =>
        console.error(
          `[FIT_VAL0034] ${JSON.stringify({
            schemaVersion: 1,
            protocol: "VAL003_004_ANDROID_DISPOSABLE",
            mode: val0034Mode,
            classification: "DIAGNOSTIC_INVALID",
            error: error instanceof Error ? error.message : "unknown VAL-003/004 probe error",
            canonicalPromotion: false,
            fallbackActivated: false
          })}`
        )
      );
  }, [val0034Mode]);

  useEffect(() => {
    if (!linkResolved || val0034Mode) return;
    runDatabaseCharacterization()
      .then((nextResult) => {
        setResult(nextResult);
        console.info(`[FIT_WP002] ${JSON.stringify(nextResult)}`);
      })
      .catch((error: unknown) => {
        const nextResult: ProbeResult = {
          status: "error",
          message: error instanceof Error ? error.message : "unknown probe error",
          readyMs: globalThis.performance.now() - startedAt
        };
        setResult(nextResult);
        console.error(`[FIT_WP002] ${JSON.stringify(nextResult)}`);
      });

    runHermesAndroidVal006Probe()
      .then((temporalReport) => emitHermesReport(temporalReport))
      .catch((error: unknown) =>
        emitHermesReport({
          schemaVersion: 1,
          wp: "WP-002",
          validation: "VAL-006",
          classification: "VAL006_HERMES_ANDROID_DIAGNOSTIC_INVALID",
          error: error instanceof Error ? error.message : "unknown temporal probe error",
          comparable: false,
          canonicalPromotion: false,
          automaticPromotion: false,
          fallbackActivated: false
        })
      )
      .catch((error: unknown) => {
        console.error(`[FIT_WP002_VAL006_HERMES_CHUNK] ${JSON.stringify({
          schemaVersion: 1,
          protocol: "VAL006_HERMES_LOGCAT_CHUNK",
          error: error instanceof Error ? error.message : "unknown chunk emission error"
        })}`);
      });
  }, [linkResolved, val0034Mode]);

  return (
    <View style={styles.screen} testID="wp002-probe-screen">
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>WP-002 disposable probe</Text>
        <Text accessibilityLiveRegion="polite" testID="wp002-probe-status">
          {val0034Mode ? `VAL-003/004 · ${val0034Mode}` : result ? `${result.status} · ${result.rowCount ?? 0} synthetic rows` : "initializing"}
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text style={styles.row}>{item}</Text>}
        initialNumToRender={16}
        windowSize={7}
        testID="wp002-synthetic-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", paddingTop: 48 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 4 },
  row: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 14 }
});
