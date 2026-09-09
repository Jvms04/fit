import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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
  const items = useMemo(
    () => Array.from({ length: SYNTHETIC_ROW_COUNT }, (_, index) => `synthetic-row-${index + 1}`),
    []
  );

  useEffect(() => {
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
  }, []);

  return (
    <View style={styles.screen} testID="wp002-probe-screen">
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>WP-002 disposable probe</Text>
        <Text accessibilityLiveRegion="polite" testID="wp002-probe-status">
          {result ? `${result.status} · ${result.rowCount ?? 0} synthetic rows` : "initializing"}
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
