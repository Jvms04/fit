import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { AppState, type AppStateStatus } from "react-native";

const DB_NAME = "wp002-val0034.db";
const KEY_REF = "wp002.val0034.sqlcipher.key";
const PENDING_REKEY_REF = "wp002.val0034.pending-rekey";
const SYNTHETIC_ROW_COUNT = 1_000;
const PACKAGE_NAME = "com.fit.wp002probe";
const PROCESS_INSTANCE_ID = Crypto.randomUUID();

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

async function verifyKeyAgainstDatabase(key: string): Promise<{ canary: boolean; integrity: string }> {
  let database: SQLite.SQLiteDatabase | null = null;
  try {
    database = await openEncrypted(key, true);
    return { canary: await queryCanary(database), integrity: await integrity(database) };
  } catch {
    return { canary: false, integrity: "unavailable" };
  } finally {
    await database?.closeAsync().catch(() => undefined);
  }
}

type CustodyRecovery = {
  key: string | null;
  activeKeyRef: "active" | "pending" | null;
  pendingKeyPresent: boolean;
  status: "NO_KEY" | "ACTIVE_VALID" | "COMMITTED_PENDING" | "PENDING_RECOVERY" | "INVALID";
  canary: boolean;
  integrity: string;
};

async function recoverKeyCustody(): Promise<CustodyRecovery> {
  const activeKey = await SecureStore.getItemAsync(KEY_REF);
  const pendingKey = await SecureStore.getItemAsync(PENDING_REKEY_REF);
  if (!activeKey && !pendingKey) {
    return { key: null, activeKeyRef: null, pendingKeyPresent: false, status: "NO_KEY", canary: false, integrity: "missing" };
  }

  if (pendingKey) {
    const pendingResult = await verifyKeyAgainstDatabase(pendingKey);
    if (pendingResult.canary && pendingResult.integrity === "ok") {
      await SecureStore.setItemAsync(KEY_REF, pendingKey, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      await SecureStore.deleteItemAsync(PENDING_REKEY_REF);
      return {
        key: pendingKey,
        activeKeyRef: "pending",
        pendingKeyPresent: false,
        status: "COMMITTED_PENDING",
        ...pendingResult
      };
    }
  }

  if (activeKey) {
    const activeResult = await verifyKeyAgainstDatabase(activeKey);
    if (activeResult.canary && activeResult.integrity === "ok") {
      return {
        key: activeKey,
        activeKeyRef: "active",
        pendingKeyPresent: Boolean(pendingKey),
        status: pendingKey ? "PENDING_RECOVERY" : "ACTIVE_VALID",
        ...activeResult
      };
    }
  }
  return { key: null, activeKeyRef: null, pendingKeyPresent: Boolean(pendingKey), status: "INVALID", canary: false, integrity: "invalid" };
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
  const custody = await recoverKeyCustody();
  const key = custody.key ?? await getOrCreateKey();
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
      let sha256: string | null = null;
      if (info.exists) {
        try {
          const bytes = await new File(fileUri(path)).bytes();
          sha256 = toHex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)));
        } catch {
          sha256 = null;
        }
      }
      inspected.push({
        name: path.split("/").pop() ?? "unknown",
        exists: info.exists,
        size: "size" in info ? info.size ?? null : null,
        sha256
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

    const extractedFiles = await inspectDatabaseFiles(databasePath);
    const extractionMeasured = extractedFiles.length === 3 && extractedFiles.every(
      (file) => file.exists === true && typeof file.sha256 === "string" && Number.isFinite(file.size)
    );
    results.push(
      sample("extract-db-wal-shm", extractionMeasured ? "MEASURED" : "INCONCLUSIVE", {
        files: extractedFiles,
        bytesVerified: extractionMeasured,
        note: extractionMeasured ? "encrypted bytes hashed in-app" : "release harness did not expose all file bytes"
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
    const recoveredIntegrity = await integrity(reopened);
    if (recovered && recoveredIntegrity === "ok") {
      await SecureStore.setItemAsync(KEY_REF, newKey, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      await SecureStore.deleteItemAsync(PENDING_REKEY_REF);
    }
    results.push(sample("rekey", recovered && recoveredIntegrity === "ok" ? "MEASURED" : "DIAGNOSTIC_INVALID", {
      recovered,
      integrity: recoveredIntegrity,
      activeKeyRef: recovered && recoveredIntegrity === "ok" ? "new" : "old",
      pendingKeyPresent: !(recovered && recoveredIntegrity === "ok")
    }));
    results.push(sample("restart-recovery", "INCONCLUSIVE", {
      reason: "new SQLite connection is not a process restart",
      recovered,
      integrity: recoveredIntegrity
    }));
    results.push(sample("integrity-after-recovery", "INCONCLUSIVE", {
      reason: "process restart required for recovery evidence",
      integrity: recoveredIntegrity,
      canary: recovered
    }));
    await reopened.closeAsync();
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
  const newKey = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(PENDING_REKEY_REF, newKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  await context.database.execAsync("BEGIN IMMEDIATE; UPDATE probe_items SET label = label || '-rekey';");
  // The host may force-stop only after BEGIN/UPDATE proves the rekey transaction started.
  console.info("[FIT_VAL0034_REKEY_STARTED]", JSON.stringify({
    databaseName: DB_NAME,
    phase: "rekey-started",
    transaction: "BEGIN_UPDATE"
  }));
  await context.database.execAsync(`PRAGMA rekey = "x'${newKey}'";`);
  await context.database.execAsync("COMMIT;");
  await context.database.closeAsync();
  await SecureStore.setItemAsync(KEY_REF, newKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  await SecureStore.deleteItemAsync(PENDING_REKEY_REF);
  console.info("[FIT_VAL0034_REKEY_COMPLETED]", JSON.stringify({
    databaseName: DB_NAME,
    phase: "rekey-completed",
    transaction: "BEGIN_UPDATE"
  }));
  return [sample("rekey-interruption", "INCONCLUSIVE", { interruptionObserved: false, reason: "no force-stop was requested" })];
}

async function runRecoveryAfterRestart() {
  const custody = await recoverKeyCustody();
  const recoveryVerified = custody.canary && custody.integrity === "ok";
  return {
    samples: [
      sample("restart-process", "INCONCLUSIVE", {
        reason: "process identity comparison is completed by the host runner",
        processInstanceId: PROCESS_INSTANCE_ID
      }),
      sample("restart-recovery", "INCONCLUSIVE", {
        recoveryVerified,
        requiresProcessRestart: true,
        activeKeyRef: custody.activeKeyRef,
        pendingKeyPresent: custody.pendingKeyPresent,
        custodyStatus: custody.status,
        canary: custody.canary,
        integrity: custody.integrity
      }),
      sample("integrity-after-recovery", "INCONCLUSIVE", {
        integrity: custody.integrity,
        requiresProcessRestart: true,
        canary: custody.canary,
        custodyStatus: custody.status
      }),
      sample("securestore-keystore", "INCONCLUSIVE", {
        keyRecoveredAfterRestart: recoveryVerified,
        requiresProcessRestart: true,
        activeKeyRef: custody.activeKeyRef,
        accessibility: "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
      })
    ],
    recovery: {
      recoveryVerified,
      activeKeyRef: custody.activeKeyRef,
      pendingKeyPresent: custody.pendingKeyPresent,
      custodyStatus: custody.status,
      canary: custody.canary,
      integrity: custody.integrity
    },
    processInstanceId: PROCESS_INSTANCE_ID
  };
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

export async function runVal0034MobileProbe(mode: "run" | "rekey-interruption" | "recovery" = "run") {
  if (mode === "rekey-interruption") {
    return {
      schemaVersion: 1,
      protocol: "VAL003_004_ANDROID_DISPOSABLE",
      packageName: PACKAGE_NAME,
      mode,
      processInstanceId: PROCESS_INSTANCE_ID,
      samples: await runRekeyInterruption(),
      accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
      canonicalPromotion: false,
      fallbackActivated: false
    };
  }
  if (mode === "recovery") {
    const recovery = await runRecoveryAfterRestart();
    return {
      schemaVersion: 1,
      protocol: "VAL003_004_ANDROID_DISPOSABLE",
      packageName: PACKAGE_NAME,
      mode,
      processInstanceId: recovery.processInstanceId,
      recovery: recovery.recovery,
      samples: recovery.samples,
      accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
      canonicalPromotion: false,
      fallbackActivated: false
    };
  }
  const samples = [...(await runVal003()), ...(await runVal004())];
  return {
    schemaVersion: 1,
    protocol: "VAL003_004_ANDROID_DISPOSABLE",
    packageName: PACKAGE_NAME,
    mode,
    processInstanceId: PROCESS_INSTANCE_ID,
    samples,
    accountIsolation: "NOT_EVALUATED_WITHOUT_AUTH_A_B",
    canonicalPromotion: false,
    fallbackActivated: false
  };
}
