import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export async function buildCryptoReadinessReport(repoRoot = process.cwd()) {
  const harnessRoot = resolve(repoRoot, "tests/native/wp-002-mobile-harness");
  const [appConfigRaw, appSource, lockRaw] = await Promise.all([
    readFile(resolve(harnessRoot, "app.json"), "utf8"),
    readFile(resolve(harnessRoot, "App.tsx"), "utf8"),
    readFile(resolve(harnessRoot, "package-lock.json"), "utf8")
  ]);
  const appConfig = JSON.parse(appConfigRaw);
  const lock = JSON.parse(lockRaw);
  const sqlitePlugin = appConfig.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === "expo-sqlite"
  );
  const versions = {
    expoSqlite: lock.packages?.["node_modules/expo-sqlite"]?.version,
    expoSecureStore: lock.packages?.["node_modules/expo-secure-store"]?.version,
    expoCrypto: lock.packages?.["node_modules/expo-crypto"]?.version
  };
  const facts = {
    sqlCipherBuildConfigured: sqlitePlugin?.[1]?.useSQLCipher === true,
    secureStoreConfigured:
      /import \* as SecureStore from "expo-secure-store";/u.test(appSource) &&
      /SecureStore\.setItemAsync/u.test(appSource),
    csprngConfigured: /Crypto\.getRandomBytesAsync\(32\)/u.test(appSource),
    mathRandomUsedForKeys: /Math\.random/u.test(appSource),
    deviceOnlyAccessibilityConfigured:
      /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/u.test(appSource),
    androidBackupDisabled: appConfig.expo.android?.allowBackup === false
  };

  requireValue(facts.sqlCipherBuildConfigured, "SQLCipher build plugin is not enabled");
  requireValue(facts.secureStoreConfigured, "SecureStore key custody is not configured");
  requireValue(facts.csprngConfigured, "CSPRNG key generation is not configured");
  requireValue(!facts.mathRandomUsedForKeys, "Math.random must not be used for key material");
  requireValue(facts.deviceOnlyAccessibilityConfigured, "device-only key accessibility is missing");
  requireValue(facts.androidBackupDisabled, "Android backup must be disabled for the probe");
  requireValue(
    JSON.stringify(versions) === JSON.stringify({
      expoSqlite: "57.0.2",
      expoSecureStore: "57.0.3",
      expoCrypto: "57.0.2"
    }),
    "locked cryptographic harness dependencies changed"
  );

  return {
    schemaVersion: 1,
    wp: "WP-002",
    classification: "VAL003_VAL004_STATIC_READINESS_PARTIAL",
    inspectedSurface: [
      "tests/native/wp-002-mobile-harness/app.json",
      "tests/native/wp-002-mobile-harness/App.tsx",
      "tests/native/wp-002-mobile-harness/package-lock.json"
    ],
    lockedDependencies: versions,
    val003: {
      sqlCipherBuildConfigured: facts.sqlCipherBuildConfigured,
      runtimeProtocolExecuted: false,
      wrongKeyExecuted: false,
      rekeyCrashExecuted: false,
      fileCanaryExtractionExecuted: false,
      performanceBudget: "NOT-PROPOSED"
    },
    val004: {
      secureStoreConfigured: facts.secureStoreConfigured,
      csprngConfigured: facts.csprngConfigured,
      mathRandomUsedForKeys: facts.mathRandomUsedForKeys,
      deviceOnlyAccessibilityConfigured: facts.deviceOnlyAccessibilityConfigured,
      androidBackupDisabled: facts.androidBackupDisabled,
      accountLifecycleExecuted: false,
      biometricChangeExecuted: false,
      backupRestoreExecuted: false
    },
    evidenceKind: "STATIC-READINESS-ONLY",
    physicalAndroidRequired: true,
    physicalIosRequired: true,
    canonicalPromotion: false,
    automaticPromotion: false,
    fallbackActivated: false
  };
}

try {
  process.stdout.write(`${JSON.stringify(await buildCryptoReadinessReport(), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
