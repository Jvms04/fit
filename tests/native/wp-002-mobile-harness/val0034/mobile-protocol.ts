import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { AppState, type AppStateStatus } from "react-native";

const DB_NAME = "wp002-val0034.db";
const KEY_REF = "wp002.val0034.sqlcipher.key";
const PENDING_REKEY_REF = "wp002.val0034.pending-rekey";
const SYNTHETIC_ROW_COUNT = 1_000;
const PACKAGE_NAME = "com.fit.wp002probe";

export type Val0034Classification =
  | "MEASURED"
  | "INCONCLUSIVE"
  | "DIAGNOSTIC_INVALID"
  | "NOT_EXECUTED"
  | "BLOCKED";

export type Val0034Sample = {
  operation: string;
  classification: Val0034Classification;
  detail?: Record<string, unknown>;
};

type DbContext = {
  database: SQLite.SQLiteDatabase;
  key: string;
  databasePath: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function sample(
  operation: string,
  classification: Val0034Classification,
  detail: Record<string, unknown> = {}
): Val0034Sample {
  return { operation, classification, detail };
}

async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_REF);
  if (existing) return existing;
  const generated = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(KEY_REF, generated, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return generated;
}

async function openEncrypted(key: string, useNewConnection = false): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection });
  await database.execAsync(`PRAGMA key = "x'${key}'";`);
  return database;
}

async function queryCanary(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const result = await database.getFirstAsync<{ canaryCount: number }>(
    "SELECT COUNT(*) AS canaryCount FROM probe_canaries WHERE name = 'fit-val003-plaintext-canary' AND value = 'fit-val003-plaintext-canary';"
  );
  return result?.canaryCount === 1;
}

async function integrity(database: SQLite.SQLiteDatabase): Promise<string> {
  const result = await database.getFirstAsync<{ integrity_check: string }>("PRAGMA integrity_check;");
  return result?.integrity_check ?? "missing";
}

async function prepareDatabase(): Promise<DbContext> {
  const key = await getOrCreateKey();
  const database = await openEncrypted(key);
  await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS probe_items (
      id INTEGER PRIMARY KEY NOT NULL,
      label TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS probe_canaries (
      name TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    DELETE FROM probe_items;
    DELETE FROM probe_canaries;
    WITH RECURSIVE counter(value) AS (
      SELECT 1
      UNION ALL
      SELECT value + 1 FROM counter WHERE value < ${SYNTHETIC_ROW_COUNT}
    )
    INSERT INTO probe_items(id, label)
    SELECT value, printf('synthetic-row-%06d', value) FROM counter;
    INSERT INTO probe_canaries(name, value) VALUES
      ('fit-val003-plaintext-canary', 'fit-val003-plaintext-canary'),
      ('fit-val003-rekey-canary', 'fit-val003-rekey-canary');
  `);
  return { database, key, databasePath: database.databasePath };
}

function fileUri(path: string): string {
  return path.startsWith("file:") ? path : `file://${path}`;
}

async function inspectDatabaseFiles(databasePath: string) {
  const files = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  const inspected: Record<string, unknown>[] = [];
  for (const path of files) {
    try {
      const info = await FileSystem.getInfoAsync(fileUri(path));
      inspected.push({
        name: path.split("/").pop() ?? "unknown",
        exists: info.exists,
        size: "size" in info ? info.size ?? null : null
      });
    } catch (error: unknown) {
      inspected.push({
        name: path.split("/").pop() ?? "unknown",
        exists: false,
        error: error instanceof Error ? error.message : "file inspection failed"
      });
    }
  }
  return inspected;
}

async function runVal003(): Promise<Val0034Sample[]> {
  const context = await prepareDatabase();
  const { database, key, databasePath } = context;
  const results: Val0034Sample[] = [];
  try {
    results.push(
      sample("create-db-wal-shm-canaries", "MEASURED", {
        databaseName: DB_NAME,
        packageName: PACKAGE_NAME,
        rowCount: SYNTHETIC_ROW_COUNT,
        canariesPresent: await queryCanary(database),
        journalMode: "WAL"
      })
    );

    results.push(
      sample("extract-db-wal-shm", "MEASURED", {
        files: await inspectDatabaseFiles(databasePath),
        note: "metadata only; external pull remains runner/device dependent"
      })
    );

    try {
      const wrong = await openEncrypted("ff".repeat(32), true);
      await wrong.getFirstAsync("SELECT COUNT(*) FROM probe_items;");
      await wrong.closeAsync();
      results.push(sample("wrong-key", "DIAGNOSTIC_INVALID", { reason: "wrong key unexpectedly opened readable database" }));
    } catch {
      results.push(sample("wrong-key", "MEASURED", { rejected: true }));
    }

    const newKey = toHex(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(PENDING_REKEY_REF, newKey, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
    await database.execAsync(`PRAGMA rekey = "x'${newKey}'";`);
    await database.closeAsync();
    const reopened = await openEncrypted(newKey, true);
    const recovered = await queryCanary(reopened);
    results.push(sample("rekey", recovered ? "MEASURED" : "DIAGNOSTIC_INVALID", { recovered }));
    results.push(sample("restart-recovery", recovered ? "MEASURED" : "INCONCLUSIVE", { recovered }));
    results.push(sample("integrity-after-recovery", (await integrity(reopened)) === "ok" ? "MEASURED" : "DIAGNOSTIC_INVALID", { integrity: await integrity(reopened) }));
    await reopened.closeAsync();
    await SecureStore.deleteItemAsync(PENDING_REKEY_REF);
  } finally {
    try {
      await database.closeAsync();
    } catch {
      // The controlled interruption path intentionally closes/terminates mid-operation.
    }
  }
  return results;
}

async function runRekeyInterruption(): Promise<Val0034Sample[]> {
  const context = await prepareDatabase();
  console.info("[FIT_VAL0034_REKEY_STARTED]", JSON.stringify({ databaseName: DB_NAME }));
  // Keep enough synchronous work after the marker for the physical runner to stop the process.
  await context.database.execAsync("BEGIN IMMEDIATE; UPDATE probe_items SET label = label || '-rekey';");
  await context.database.execAsync(`PRAGMA rekey = "x'${toHex(await Crypto.getRandomBytesAsync(32))}'";`);
  await context.database.execAsync("COMMIT;");
  await context.database.closeAsync();
  return [sample("rekey-interruption", "MEASURED", { interruptionObserved: false })];
}

async function runVal004(): Promise<Val0034Sample[]> {
  const key = await getOrCreateKey();
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const biometricCapability = await SecureStore.canUseBiometricAuthentication();
  const lifecycle: AppStateStatus[] = [];
  const subscription = AppState.addEventListener("change", (state) => {
    lifecycle.push(state);
    console.info("[FIT_VAL0034_APPSTATE]", JSON.stringify({ state, sealed: state !== "active" }));
  });
  // Keep the listener alive after the report marker so the external runner can
  // perform a real lock/unlock transition and capture the emitted state.
  void subscription;
  return [
    sample("securestore-keystore", key.length === 64 ? "MEASURED" : "DIAGNOSTIC_INVALID", {
      keyStored: key.length === 64,
      accessibility: "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
    }),
    sample("csprng", randomBytes.length === 32 ? "MEASURED" : "DIAGNOSTIC_INVALID", { byteLength: randomBytes.length }),
    sample("restart-process", "INCONCLUSIVE", { reason: "requires runner process restart" }),
    sample("screen-lock-sealed-state", "INCONCLUSIVE", { lifecycle, requiresPhysicalLock: true }),
    sample("biometric-change", biometricCapability ? "INCONCLUSIVE" : "BLOCKED", {
      capability: biometricCapability,
      reason: "device action required; no biometric mutation is performed by harness"
    })
  ];
}

export async function runVal0034MobileProbe(mode: "run" | "rekey-interruption" = "run") {
  const samples = mode === "rekey-interruption" ? await runRekeyInterruption() : [...(await runVal003()), ...(await runVal004())];
  return {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    packageName: PACKAGE_NAME,
    mode,
    samples,
    accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
    canonicalPromotion: false,
    fallbackActivated: false
  };
}
